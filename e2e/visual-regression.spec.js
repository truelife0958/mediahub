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

function seedVisualRegressionData() {
  const db = new DatabaseSync(DB_FILE);
  const now = new Date().toISOString();

  const insertContent = db.prepare(`
    INSERT OR REPLACE INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at, normalized_title, dedupe_hash
    ) VALUES (
      @id, @type, @title, @cover, @summary, @author, @ipName, @status, @hotScore,
      @tagsJson, @actorsJson, @sourceJson, @createdAt, @updatedAt, @cachedAt, @normalizedTitle, @dedupeHash
    )
  `);

  for (const type of ['drama', 'novel', 'comic', 'anime']) {
    for (let i = 1; i <= 12; i += 1) {
      const title = `${type.toUpperCase()} 视觉基线 ${i}`;
      insertContent.run({
        id: `${type}:visual:${i}`,
        type,
        title,
        cover: `https://example.com/visual-${type}-${i}.jpg`,
        summary: `视觉回归稳定样本 ${type} #${i}`,
        author: `${type}-author`,
        ipName: `${type}-ip`,
        status: i % 2 === 0 ? 'completed' : 'ongoing',
        hotScore: 10000 - i,
        tagsJson: JSON.stringify(['视觉回归', type]),
        actorsJson: JSON.stringify([`${type}-actor`]),
        sourceJson: JSON.stringify({ provider: 'visual', label: 'Visual Baseline', url: 'https://example.com' }),
        createdAt: now,
        updatedAt: now,
        cachedAt: now,
        normalizedTitle: title.toLowerCase(),
        dedupeHash: `visual-${type}-${i}`,
      });
    }
  }

  db.close();
}

async function hideNonDeterministicNodes(page) {
  await page.addStyleTag({
    content: `
      [data-testid="toast"],
      .api-state-icon,
      [data-testid^="admin-source-updated-"],
      [data-testid^="admin-source-stage-"],
      [data-testid^="admin-source-error-"],
      * {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function waitForHomeReady(page) {
  await expect(page.getByRole('heading', { name: 'MediaHub' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '为你推荐' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^查看详情：/ }).first()).toBeVisible();
}

async function waitForAdminReady(page) {
  await loginAdmin(page);
  await page.getByTestId('admin-nav-operate').click();
  await page.getByTestId('admin-tab-operate-ingest').click();
  await expect(page.getByRole('heading', { name: 'AI 热门检索入库' })).toBeVisible();
  await expect(page.getByRole('button', { name: '手动获取/入库' }).first()).toBeVisible();
}

test.describe('MediaHub 视觉回归', () => {
  test.beforeAll(() => {
    seedVisualRegressionData();
  });

  test('首页桌面布局基线', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForHomeReady(page);
    await hideNonDeterministicNodes(page);
    await expect(page).toHaveScreenshot('home-desktop.png', {
      maxDiffPixelRatio: 0.015,
      animations: 'disabled',
    });
  });

  test('首页移动端布局基线', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForHomeReady(page);
    await hideNonDeterministicNodes(page);
    await expect(page).toHaveScreenshot('home-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('后台桌面布局基线', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/admin');
    await waitForAdminReady(page);
    await hideNonDeterministicNodes(page);
    await expect(page).toHaveScreenshot('admin-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('后台移动端布局基线', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/admin');
    await waitForAdminReady(page);
    await hideNonDeterministicNodes(page);
    await expect(page).toHaveScreenshot('admin-mobile.png', {
      maxDiffPixelRatio: 0.025,
      animations: 'disabled',
    });
  });
});
