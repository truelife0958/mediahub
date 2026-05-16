const { test, expect } = require('playwright/test');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_FILE = process.env.MEDIAHUB_DB_PATH || path.resolve(__dirname, '../backend/data/mediahub.sqlite');
const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

async function loginAdmin(page) {
  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录后台' }).click();
  await expect(page.getByTestId('admin-left-nav')).toBeVisible();
}

function ensureSmokeSeedData() {
  const db = new DatabaseSync(DB_FILE);
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at, normalized_title, dedupe_hash
    ) VALUES (
      @id, @type, @title, @cover, @summary, @author, @ipName, @status, @hotScore,
      @tagsJson, @actorsJson, @sourceJson, @createdAt, @updatedAt, @cachedAt, @normalizedTitle, @dedupeHash
    )
  `);

  const rows = [
    {
      id: 'drama:smoke:e2e-1',
      type: 'drama',
      title: 'E2E 冒烟短剧 A',
      cover: 'https://example.com/cover-a.jpg',
      summary: '用于 Playwright 冒烟流程的稳定样本 A',
      author: 'Smoke Studio',
      ipName: 'E2E-A',
      status: 'ongoing',
      hotScore: 99999,
      tagsJson: JSON.stringify(['冒烟', '短剧']),
      actorsJson: JSON.stringify(['演员A']),
      sourceJson: JSON.stringify({ provider: 'smoke', label: 'Smoke Source', url: 'https://example.com' }),
      createdAt: now,
      updatedAt: now,
      cachedAt: now,
      normalizedTitle: 'e2e 冒烟短剧 a',
      dedupeHash: 'smoke-e2e-a',
    },
    {
      id: 'drama:smoke:e2e-2',
      type: 'drama',
      title: 'E2E 冒烟短剧 B',
      cover: 'https://example.com/cover-b.jpg',
      summary: '用于 Playwright 冒烟流程的稳定样本 B',
      author: 'Smoke Studio',
      ipName: 'E2E-B',
      status: 'completed',
      hotScore: 99998,
      tagsJson: JSON.stringify(['冒烟', '推荐']),
      actorsJson: JSON.stringify(['演员B']),
      sourceJson: JSON.stringify({ provider: 'smoke', label: 'Smoke Source', url: 'https://example.com' }),
      createdAt: now,
      updatedAt: now,
      cachedAt: now,
      normalizedTitle: 'e2e 冒烟短剧 b',
      dedupeHash: 'smoke-e2e-b',
    },
  ];

  for (const row of rows) insert.run(row);
  db.close();
}

test.describe('MediaHub 冒烟流程', () => {
  test.beforeAll(() => {
    ensureSmokeSeedData();
  });

  test('首页加载并可进入详情页', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'MediaHub' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '为你推荐' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

    const cardButton = page.getByRole('button', { name: /^查看详情：/ }).first();
    await expect(cardButton).toBeVisible();
    await cardButton.click();

    await expect(page).toHaveURL(/\/detail\//);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByText(/热度/)).toBeVisible();
  });

test('后台关键操作可达且 AI 入库链路可交互', async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ingest').click();
    await expect(page.getByRole('heading', { name: 'AI 热门检索入库' })).toBeVisible();
    await expect(page.getByRole('button', { name: '新增平台' })).toHaveCount(0);

    await page.getByTestId('admin-manual-refresh-drama').click();
    await expect(page.getByTestId('admin-source-status-drama')).toContainText(/状态：(success|failed|暂无记录)/);
    await expect(page.getByTestId('admin-source-count-drama')).toContainText(/条数：\d+/);
  });
});
