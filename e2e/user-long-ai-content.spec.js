const { test, expect } = require('playwright/test');

test('ordinary user content loading waits beyond the default short UI timeout', async ({ page }) => {
  await page.route('**/api/contents?type=drama**', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 13_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          list: [
            {
              id: 'drama:ai-search:slow-ui-1',
              title: '慢速 AI 短剧',
              summary: '模拟 AI 搜索超过前端默认 12 秒后返回。',
              type: 'drama',
              tags: ['AI'],
              actors: ['MediaHub'],
              author: 'AI Discovery',
              ipName: '慢速 AI',
              status: 'ongoing',
              hotScore: 999,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              source: { provider: 'ai-search', label: 'AI Trending Search', url: 'https://example.com/slow-ai' },
            },
          ],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      }),
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
  await expect(page.getByText('慢速 AI 短剧')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('网络超时')).toHaveCount(0);
});
