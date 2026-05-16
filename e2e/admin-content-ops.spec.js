const { test, expect } = require('playwright/test');
const http = require('node:http');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

function startMockChatGateway() {
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
      calls.push({ url: req.url, body, authorization: req.headers.authorization });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: 'AI 补齐后的后台补录简介，覆盖普通用户可读的完整剧情卖点。',
              tags: ['AI补录', '质量治理'],
              actors: ['补录角色'],
              author: 'AI 补全作者',
              ipName: '后台补录 IP',
              status: 'completed',
              hotScore: 8765,
            }),
          },
        }],
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

test('admin can save AI config to env, create manual content, fill missing fields and show it to users', async ({ page }) => {
  const gateway = await startMockChatGateway();
  const title = `后台补录漫画 ${Date.now()}`;

  try {
    await page.goto('/admin');
    await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录后台' }).click();
    await expect(page.getByTestId('admin-left-nav')).toBeVisible();

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ai').click();
    await page.getByPlaceholder('模型名，如 gpt-5-mini').fill('gpt-5-mini');
    await page.getByPlaceholder('Base URL').fill(gateway.baseUrl);
    await page.getByPlaceholder(/API Key|留空则保留现有 API Key/).fill('sk-e2e-env');
    await page.getByText('环境变量 .env').click();
    await page.getByRole('button', { name: '保存 AI 配置' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('AI 模型配置已保存到环境变量', { timeout: 20_000 });

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-library').click();
    await page.getByRole('combobox').first().selectOption('comic');
    await page.getByRole('textbox', { name: '标题', exact: true }).fill(title);
    await page.getByPlaceholder('热度').fill('0');
    await page.getByRole('button', { name: '创建补录' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText(`已补录内容《${title}》`, { timeout: 20_000 });

    await page.getByRole('button', { name: `编辑内容：${title}` }).click();
    await expect(page.getByRole('dialog', { name: '编辑内容' })).toBeVisible();
    await page.getByRole('button', { name: 'AI 补缺失信息' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('AI 已补齐', { timeout: 20_000 });
    await expect(page.getByText('AI 补齐后的后台补录简介').last()).toBeVisible();
    await expect(page.getByText('AI补录').last()).toBeVisible();
    await expect.poll(() => gateway.calls.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(gateway.calls[0].url).toBe('/v1/chat/completions');
    expect(gateway.calls[0].authorization).toBe('Bearer sk-e2e-env');
    expect(Array.isArray(gateway.calls[0].body.messages)).toBe(true);
    expect(gateway.calls[0].body).not.toHaveProperty('input');

    await page.getByRole('button', { name: '关闭编辑' }).click();
    await expect(page.getByRole('dialog', { name: '编辑内容' })).toBeHidden();
    await page.getByRole('link', { name: '返回前台' }).click();
    await page.getByRole('button', { name: '漫 漫画' }).click();
    await page.getByPlaceholder('搜索内容、演员、作者、IP...').fill(title);
    await page.getByRole('button', { name: '搜索' }).click();
    const createdCard = page.getByRole('button', { name: `查看详情：${title}` }).first();
    await expect(createdCard).toBeVisible({ timeout: 20_000 });
    await createdCard.click();
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible({ timeout: 20_000 });
  } finally {
    await gateway.close();
  }
});
