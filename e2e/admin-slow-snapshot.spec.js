const { test, expect } = require('playwright/test');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

function jsonResponse(data) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, data }),
  };
}

test('admin dashboard waits beyond default short timeout for slow statistics snapshots', async ({ page }) => {
  let summaryHit = false;
  await page.route('**/api/system/admin-summary', async (route) => {
    summaryHit = true;
    await new Promise(resolve => setTimeout(resolve, 13_000));
    await route.fulfill(jsonResponse({
      totals: { contents: 0, sources: 0, successfulRuns: 0, failedRuns: 0 },
      byType: [],
      latestRuns: [],
    }));
  });
  await page.route('**/api/system/admin-quality', async route => route.fulfill(jsonResponse({
    duplicateCandidates: [],
    missingSummary: 0,
    missingTags: 0,
    lowHotScore: 0,
  })));
  await page.route('**/api/system/admin-logs?**', async route => route.fulfill(jsonResponse({ runs: [], errorSummary: {} })));
  await page.route('**/api/system/admin-contents?**', async route => route.fulfill(jsonResponse({
    list: [],
    pagination: { page: 1, limit: 12, total: 0 },
  })));

  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录后台' }).click();

  await expect(page.getByTestId('admin-left-nav')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('admin-feedback-message')).toHaveCount(0);
  await expect(page.getByText('网络超时')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => summaryHit, { timeout: 20_000 }).toBeTruthy();
});
