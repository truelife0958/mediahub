import { chromium } from 'playwright';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root = '/root/MediaHub';
const outDir = path.join(root, 'test-results/manual-debug');
mkdirSync(outDir, { recursive: true });

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function waitForOutput(proc, pattern, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${label}`)), timeoutMs);
    const onData = (chunk) => {
      const text = String(chunk);
      if (pattern.test(text)) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
  });
}

function spawnServer(command, env = {}) {
  return spawn('bash', ['-lc', command], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function startGateway({ title, sourceUrl, releaseDate }) {
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      calls.push({ url: req.url, authorization: req.headers.authorization, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ items: [{ title, summary: '手动浏览器调试：本地模型网关返回，后端真实入库。', tags: ['浏览器调试', 'AI获取'], actors: ['Manual Debug'], author: 'Mock Chat Gateway', ipName: '手动真实链路', status: 'ongoing', hotScore: 9888, sourceUrl, cover: '', releaseDate }] }) } }] }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, calls, close: () => new Promise(resolve => server.close(resolve)) };
}

const unique = Date.now();
const title = `手动浏览器真实 AI 获取 ${unique}`;
const gateway = await startGateway({ title, sourceUrl: `https://example.com/manual-ai-${unique}`, releaseDate: new Date(unique).toISOString() });
const backendPort = 43103;
const frontendPort = 45201;
const dbDir = path.join(os.tmpdir(), `mediahub-manual-debug-${unique}`);
mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'mediahub.sqlite');

const backend = spawnServer(`PORT=${backendPort} MEDIAHUB_DB_PATH=${JSON.stringify(dbPath)} MEDIAHUB_AUTO_REFRESH_ENABLED=false MEDIAHUB_AUTO_REFRESH_ON_STARTUP=false MEDIAHUB_PLATFORM_SOURCE_ENABLED=false npm run dev --workspace=backend`);
const frontend = spawnServer(`VITE_API_TARGET=http://127.0.0.1:${backendPort} npm run dev --workspace=frontend -- --host 127.0.0.1 --port ${frontendPort} --strictPort`);
const serverLog = [];
for (const [name, proc] of [['backend', backend], ['frontend', frontend]]) {
  proc.stdout.on('data', chunk => serverLog.push(`[${name}] ${chunk}`));
  proc.stderr.on('data', chunk => serverLog.push(`[${name}:err] ${chunk}`));
}

const browserErrors = [];
try {
  await Promise.all([
    waitForOutput(backend, /listening|localhost|127\.0\.0\.1|健康|health|300|43103/i, 120000, 'backend'),
    waitForOutput(frontend, /Local:|ready|http:\/\/127\.0\.0\.1/i, 120000, 'frontend'),
  ]).catch(async () => { await wait(3000); });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') browserErrors.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => browserErrors.push(`pageerror: ${err.message}`));
  page.on('response', res => { if (res.status() >= 400 && !res.url().includes('/favicon')) browserErrors.push(`http ${res.status()}: ${res.url()}`); });

  const base = `http://127.0.0.1:${frontendPort}`;
  await page.goto(`${base}/admin`);
  await page.screenshot({ path: path.join(outDir, '01-admin-login.png'), fullPage: true });
  await page.getByLabel('管理员密码').fill(process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026');
  await page.getByRole('button', { name: '登录后台' }).click();
  await page.getByTestId('admin-left-nav').waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, '02-admin-home.png'), fullPage: true });

  await page.getByTestId('admin-nav-ai').click();
  await page.getByTestId('admin-tab-ai-config').click();
  await page.getByPlaceholder('模型名，如 gpt-5-mini').fill('gpt-5-mini');
  await page.getByPlaceholder('Base URL').fill(gateway.baseUrl);
  await page.getByPlaceholder(/API Key|留空则保留现有 API Key/).fill('sk-manual-debug');
  await page.getByRole('button', { name: '保存 AI 配置' }).click();
  await page.getByTestId('admin-feedback-message').waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, '03-ai-config-saved.png'), fullPage: true });

  await page.getByTestId('admin-tab-ai-ingest').click();
  await page.getByTestId('admin-manual-refresh-comic').click();
  await page.getByTestId('admin-feedback-message').filter({ hasText: '漫画 AI 刷新完成，入库 1 条' }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(outDir, '04-ai-ingestion-success.png'), fullPage: true });

  await page.getByRole('link', { name: '返回前台' }).click();
  await page.getByRole('button', { name: /漫画/ }).click();
  await page.getByRole('button', { name: `查看详情：${title}` }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, '05-frontend-ai-content-visible.png'), fullPage: true });

  await browser.close();
  const report = {
    title,
    gatewayBaseUrl: gateway.baseUrl,
    gatewayCalls: gateway.calls.map(call => ({ url: call.url, authorization: call.authorization, hasMessages: Array.isArray(call.body.messages), hasInput: Object.prototype.hasOwnProperty.call(call.body, 'input'), model: call.body.model })),
    browserErrors,
  };
  writeFileSync(path.join(outDir, 'manual-ai-browser-debug-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  await gateway.close();
  writeFileSync(path.join(outDir, 'manual-ai-browser-debug-server.log'), serverLog.join(''));
}
