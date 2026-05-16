const { test, expect } = require('playwright/test');
const http = require('node:http');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

function startMockChatGateway({ title, sourceUrl, releaseDate }) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }

    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      calls.push({
        url: req.url,
        authorization: req.headers.authorization,
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                items: [
                  {
                    title,
                    summary: '这条内容由 Playwright 本地模型网关返回，并经后端真实入库。',
                    tags: ['AI获取', '真实链路'],
                    actors: ['MediaHub E2E'],
                    author: 'Mock Chat Gateway',
                    ipName: '真实 AI 获取测试',
                    status: 'ongoing',
                    hotScore: 9876,
                    sourceUrl,
                    cover: '',
                    releaseDate,
                  },
                ],
              }),
            },
          },
        ],
      }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        calls,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

test('admin can fetch AI data through the real backend ingestion path and users can see it', async ({ page }) => {
  const unique = Date.now();
  const title = `浏览器真实 AI 获取漫画 ${unique}`;
  const sourceUrl = `https://example.com/real-ai-ingestion-comic-${unique}`;
  const releaseDate = new Date(unique).toISOString();
  const gateway = await startMockChatGateway({ title, sourceUrl, releaseDate });
  try {
    await page.goto('/admin');
    await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录后台' }).click();
    await expect(page.getByTestId('admin-left-nav')).toBeVisible();

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ai').click();
    await page.getByPlaceholder('模型名，如 gpt-5-mini').fill('gpt-5-mini');
    await page.getByPlaceholder('Base URL').fill(gateway.baseUrl);
    await page.getByPlaceholder(/API Key|留空则保留现有 API Key/).fill('sk-e2e-real-ai');
    await page.getByText('环境变量 .env').click();
    await page.getByRole('button', { name: '保存 AI 配置' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('AI 模型配置已保存', { timeout: 20_000 });

    await page.getByTestId('admin-tab-operate-ingest').click();
    await page.getByTestId('admin-manual-refresh-comic').click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('漫画 AI 刷新完成，入库 1 条', { timeout: 30_000 });
    await expect(page.getByTestId('admin-feedback-message')).not.toContainText('网络超时');
    await expect(page.getByTestId('admin-source-provider-comic')).toContainText('ai-search', { timeout: 20_000 });
    await expect.poll(() => gateway.calls.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(gateway.calls[0].url).toBe('/v1/chat/completions');
    expect(gateway.calls[0].authorization).toBe('Bearer sk-e2e-real-ai');
    expect(Array.isArray(gateway.calls[0].body.messages)).toBe(true);
    expect(gateway.calls[0].body).not.toHaveProperty('input');

    await page.getByRole('link', { name: '返回前台' }).click();
    await page.getByRole('button', { name: '漫 漫画' }).click();
    await page.getByPlaceholder('搜索内容、演员、作者、IP...').fill(title);
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('button', { name: `查看详情：${title}` }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('main').getByText(title).first()).toBeVisible();
  } finally {
    await gateway.close();
  }
});
