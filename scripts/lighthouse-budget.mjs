#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PROJECT_ROOT = '/root/MediaHub';
const BACKEND_PORT = Number(process.env.LH_BACKEND_PORT || 3005);
const FRONTEND_PORT = Number(process.env.LH_FRONTEND_PORT || 5185);
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const TARGET_URL = `${BASE_URL}/`;
const CHROME_PATH = process.env.LH_CHROME_PATH || '/usr/bin/google-chrome';
const TEMP_ROOT_PREFIX = path.join(os.tmpdir(), 'mediahub-lighthouse-');

const budgets = {
  performanceScoreMin: 0.65,
  firstContentfulPaintMsMax: 2200,
  largestContentfulPaintMsMax: 3600,
  totalBlockingTimeMsMax: 450,
  cumulativeLayoutShiftMax: 0.12,
  speedIndexMsMax: 3800,
  interactiveMsMax: 5200,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        CHROME_PATH,
      },
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

async function waitHttpReady(url, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await runCommand('curl', ['-sS', '-f', '--max-time', '2', url]);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`服务未就绪: ${url}`);
}

async function createWorkspace() {
  const workspaceRoot = await mkdtemp(TEMP_ROOT_PREFIX);
  const chromeUserDataDir = path.join(workspaceRoot, 'chrome-user-data');
  const reportPath = path.join(workspaceRoot, 'lighthouse-report.json');
  await mkdir(chromeUserDataDir, { recursive: true });
  return { workspaceRoot, chromeUserDataDir, reportPath };
}

function cleanupWorkspace(workspaceRoot) {
  if (!workspaceRoot) return;
  rmSync(workspaceRoot, { recursive: true, force: true });
}

function parseLighthouseReport(reportPath) {
  if (!existsSync(reportPath)) {
    throw new Error(`缺少 Lighthouse 报告: ${reportPath}`);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const audits = report.audits || {};
  const categories = report.categories || {};

  return {
    performanceScore: Number(categories.performance?.score || 0),
    firstContentfulPaintMs: Number(audits['first-contentful-paint']?.numericValue || Infinity),
    largestContentfulPaintMs: Number(audits['largest-contentful-paint']?.numericValue || Infinity),
    totalBlockingTimeMs: Number(audits['total-blocking-time']?.numericValue ?? Infinity),
    cumulativeLayoutShift: Number(audits['cumulative-layout-shift']?.numericValue || Infinity),
    speedIndexMs: Number(audits['speed-index']?.numericValue || Infinity),
    interactiveMs: Number(audits.interactive?.numericValue || Infinity),
  };
}

function checkBudgets(metrics) {
  const failures = [];
  const checks = [
    [metrics.performanceScore >= budgets.performanceScoreMin, `performance >= ${budgets.performanceScoreMin}`, metrics.performanceScore],
    [metrics.firstContentfulPaintMs <= budgets.firstContentfulPaintMsMax, `FCP <= ${budgets.firstContentfulPaintMsMax}ms`, metrics.firstContentfulPaintMs],
    [metrics.largestContentfulPaintMs <= budgets.largestContentfulPaintMsMax, `LCP <= ${budgets.largestContentfulPaintMsMax}ms`, metrics.largestContentfulPaintMs],
    [metrics.totalBlockingTimeMs <= budgets.totalBlockingTimeMsMax, `TBT <= ${budgets.totalBlockingTimeMsMax}ms`, metrics.totalBlockingTimeMs],
    [metrics.cumulativeLayoutShift <= budgets.cumulativeLayoutShiftMax, `CLS <= ${budgets.cumulativeLayoutShiftMax}`, metrics.cumulativeLayoutShift],
    [metrics.speedIndexMs <= budgets.speedIndexMsMax, `SpeedIndex <= ${budgets.speedIndexMsMax}ms`, metrics.speedIndexMs],
    [metrics.interactiveMs <= budgets.interactiveMsMax, `Interactive <= ${budgets.interactiveMsMax}ms`, metrics.interactiveMs],
  ];

  for (const [ok, label, actual] of checks) {
    if (!ok) failures.push(`${label} (actual: ${actual})`);
  }
  return failures;
}

async function main() {
  const workspace = await createWorkspace();
  const backend = spawn('/bin/bash', ['-lc', `cd "${PROJECT_ROOT}" && PORT=${BACKEND_PORT} MEDIAHUB_PLATFORM_SOURCE_ENABLED=false npm run dev --workspace=backend`], {
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      CHROME_PATH,
    },
  });
  backend.unref();

  const frontend = spawn('/bin/bash', ['-lc', `cd "${PROJECT_ROOT}" && VITE_API_TARGET=http://127.0.0.1:${BACKEND_PORT} npm run dev --workspace=frontend -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`], {
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      CHROME_PATH,
    },
  });
  frontend.unref();

  const stopServers = async () => {
    try { process.kill(-backend.pid, 'SIGTERM'); } catch {}
    try { process.kill(-frontend.pid, 'SIGTERM'); } catch {}
  };

  try {
    await waitHttpReady(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
    await waitHttpReady(TARGET_URL);

    await runCommand('npx', [
      '--yes',
      'lighthouse',
      TARGET_URL,
      '--output=json',
      `--output-path=${workspace.reportPath}`,
      `--chrome-path=${CHROME_PATH}`,
      '--quiet',
      `--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --user-data-dir=${workspace.chromeUserDataDir}`,
      '--only-categories=performance',
      '--throttling-method=devtools',
      '--form-factor=desktop',
      '--preset=desktop',
    ], { cwd: PROJECT_ROOT });

    const metrics = parseLighthouseReport(workspace.reportPath);
    const failures = checkBudgets(metrics);
    console.log(JSON.stringify({ budgets, metrics }, null, 2));

    if (failures.length > 0) {
      throw new Error(`Lighthouse 性能预算未通过:\n- ${failures.join('\n- ')}`);
    }
  } finally {
    await stopServers();
    cleanupWorkspace(workspace.workspaceRoot);
  }
}

main().catch((error) => {
  if (error?.stdout) {
    console.error('[stdout]');
    console.error(String(error.stdout).trim());
  }
  if (error?.stderr) {
    console.error('[stderr]');
    console.error(String(error.stderr).trim());
  }
  console.error(error.message || error);
  process.exit(1);
});
