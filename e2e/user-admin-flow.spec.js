const { test, expect } = require('playwright/test');
const { DatabaseSync } = require('node:sqlite');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

function seedContents() {
  const dbPath = process.env.MEDIAHUB_DB_PATH;
  if (!dbPath) return;
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const contents = [
    {
      id: 'drama:ai-search:e2e-1',
      title: 'AI 冒险短剧',
      summary: '普通用户浏览链路测试内容，来自 AI 模型缓存。',
      type: 'drama',
      tags: ['AI', '冒险'],
      actors: ['MediaHub'],
      author: 'AI Discovery',
      ipName: 'AI 冒险',
      status: 'completed',
      hotScore: 980,
      source: { provider: 'ai-search', label: 'AI Trending Search', url: 'https://example.com/e2e-drama' },
    },
    {
      id: 'novel:ai-search:e2e-1',
      title: 'AI 奇幻小说',
      summary: '用于小说分类与搜索测试的 AI 数据。',
      type: 'novel',
      tags: ['AI', '奇幻'],
      actors: [],
      author: 'AI Discovery',
      ipName: 'AI 奇幻',
      status: 'ongoing',
      hotScore: 860,
      source: { provider: 'ai-search', label: 'AI Trending Search', url: 'https://example.com/e2e-novel' },
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at,
      normalized_title, dedupe_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const content of contents) {
    stmt.run(
      content.id,
      content.type,
      content.title,
      '',
      content.summary,
      content.author,
      content.ipName,
      content.status,
      content.hotScore,
      JSON.stringify(content.tags),
      JSON.stringify(content.actors),
      JSON.stringify(content.source),
      now,
      now,
      now,
      content.title.toLowerCase(),
      `${content.type}|${content.title.toLowerCase()}|ai-search|${content.ipName.toLowerCase()}`,
    );
  }
  db.exec(`
    DELETE FROM contents_fts;
    INSERT INTO contents_fts(rowid, id, title, summary, author, ip_name)
    SELECT rowid, id, title, summary, author, ip_name
    FROM contents
  `);
  db.close();
}

const adminModules = [
  { id: 'operate', tabs: ['library', 'ingest', 'ai'] },
  { id: 'monitor', tabs: ['metrics', 'quality', 'routing', 'system', 'logs'] },
  { id: 'reference', tabs: ['prompt', 'keywords', 'rules'] },
];

function wirePageDiagnostics(page, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes('/favicon')) {
      errors.push(`http ${status}: ${url}`);
    }
  });
}

test('ordinary user can browse core frontend flows without admin access', async ({ page }) => {
  const errors = [];
  wirePageDiagnostics(page, errors);
  seedContents();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

  await page.getByRole('button', { name: '文 小说' }).click();
  await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

  await page.getByPlaceholder('搜索内容、演员、作者、IP...').fill('AI');
  await page.getByRole('button', { name: '搜索' }).click();
  await expect(page.getByText('关键词', { exact: true })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: '清空筛选' }).click();
  const firstCard = page.locator('.content-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page.getByText(/热度/).first()).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  await expect(page.getByTestId('admin-left-nav')).toHaveCount(0);

  expect(errors.filter(item => !item.includes('/api/admin/me'))).toEqual([]);
});

test('ordinary user survives malformed search input and invalid detail route', async ({ page }) => {
  const errors = [];
  wirePageDiagnostics(page, errors);
  seedContents();

  await page.goto('/');
  const noisyInput = `${'😀'.repeat(60)}  AI  `;
  await page.getByPlaceholder('搜索内容、演员、作者、IP...').fill(noisyInput);
  await expect(page.getByLabel('搜索内容、演员、作者、IP')).toHaveValue(/^.{1,80}$/);
  await page.getByRole('button', { name: '搜索' }).click();

  await expect(page.getByText('关键词', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '清空筛选' })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: '清空筛选' }).click();
  await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

  await page.goto('/detail/not-found-id');
  await expect(page.getByText('详情源暂不可用')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible();

  expect(errors.filter(item => !item.includes('/favicon'))).toEqual([]);
});

test('admin can login, open every module and tab, return home, then logout', async ({ page }) => {
  const errors = [];
  wirePageDiagnostics(page, errors);
  seedContents();

  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录后台' }).click();
  await expect(page.getByTestId('admin-left-nav')).toBeVisible();

  for (const module of adminModules) {
    await page.getByTestId(`admin-nav-${module.id}`).click();
    for (const tab of module.tabs) {
      await page.getByTestId(`admin-tab-${module.id}-${tab}`).click();
      await expect(page.getByTestId(`admin-panel-${module.id}-${tab}`)).toBeVisible();
    }
  }

  await expect(page.getByTestId('admin-nav-recommend')).toHaveCount(0);
  await expect(page.getByTestId('admin-nav-quality')).toHaveCount(0);
  await expect(page.getByTestId('admin-nav-logs')).toHaveCount(0);

  await page.getByTestId('admin-nav-operate').click();
  await page.getByTestId('admin-tab-operate-library').click();
  await page.getByRole('button', { name: /^编辑内容：/ }).first().click();
  await expect(page.getByRole('dialog', { name: '编辑内容' })).toBeVisible();
  await page.getByLabel('状态').selectOption('ongoing');
  await page.getByRole('button', { name: '关闭编辑' }).click();
  await expect(page.getByRole('dialog', { name: '编辑内容' })).toHaveCount(0);

  await page.getByRole('link', { name: '返回前台' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByTestId('admin-left-nav')).toBeVisible();
  await page.getByRole('button', { name: '退出后台' }).click();
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();

  const actionableErrors = errors.filter(item => (
    !item.includes('/api/admin/me') &&
    !item.includes('/api/system/admin-logs') &&
    !item.includes('/api/system/admin-quality')
  ));
  expect(actionableErrors).toEqual([]);
});
