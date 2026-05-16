const { test, expect } = require('playwright/test');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

test('admin AI manual refresh waits beyond the default short UI timeout', async ({ page }) => {
  await page.route('**/api/ingestion/refresh?type=drama', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 13_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          type: 'drama',
          source: 'ai-search',
          status: 'success',
          count: 3,
          partial: false,
          failedPages: 0,
          attemptedPages: 1,
          warning: null,
        },
      }),
    });
  });

  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录后台' }).click();
  await expect(page.getByTestId('admin-left-nav')).toBeVisible();

  await page.getByTestId('admin-nav-operate').click();
  await page.getByTestId('admin-tab-operate-ingest').click();
  await page.getByTestId('admin-manual-refresh-drama').click();

  await expect(page.getByTestId('admin-feedback-message')).toContainText('短剧 AI 刷新完成，入库 3 条', { timeout: 20_000 });
  await expect(page.getByTestId('admin-feedback-message')).not.toContainText('网络超时');
});
