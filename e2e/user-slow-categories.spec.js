const { test, expect } = require('playwright/test');

test('ordinary user category loading waits beyond the old short UI timeout', async ({ page }) => {
  await page.route('**/api/categories', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 13_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [
          { id: 'drama', name: '短剧', icon: '剧' },
          { id: 'novel', name: '小说', icon: '文' },
          { id: 'comic', name: '漫画', icon: '漫' },
          { id: 'anime', name: '动漫', icon: '动' },
        ],
      }),
    });
  });

  await page.route('**/api/contents?type=drama**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { list: [], pagination: { page: 1, limit: 20, total: 0 } } }),
    });
  });

  await page.route('**/api/recommendations/for-you?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [] }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '文 小说' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('请求超时或已取消')).toHaveCount(0);
  await expect(page.getByText('网络超时')).toHaveCount(0);
});
