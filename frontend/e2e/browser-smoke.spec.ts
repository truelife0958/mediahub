import { expect, test, type Page, type Route } from '@playwright/test';

const apiBaseUrl = process.env.MEDIAHUB_E2E_API_URL || 'http://127.0.0.1:3001';
const adminPassword = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';
const visibleTypes = ['drama', 'novel', 'anime', 'comic'] as const;
const badTextPatterns = [
  /请求失败\(/,
  /响应格式异常/,
  /页面不存在/,
  /Cannot GET/i,
  /上游内容服务暂不可用/,
];

async function apiGet(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`);
  const payload = await response.json();
  expect(response.ok, `${path} ${response.status} ${JSON.stringify(payload).slice(0, 240)}`).toBeTruthy();
  if (path !== '/api/health') expect(payload.code).toBe(0);
  return payload;
}

async function assertCleanPage(page: Page, path: string, options: { waitForRows?: boolean } = {}) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    const url = response.url();
    if ((url.includes('/api/') || url.startsWith(String(page.url()).split(path)[0])) && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${url}`);
    }
  });

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  if (options.waitForRows) {
    await page.waitForSelector('.dashboard-rank-row:not(.is-loading)', { timeout: 30_000 });
  }

  const text = await page.locator('body').innerText();
  expect(text.trim().length, `${path} body should not be empty`).toBeGreaterThan(0);
  for (const pattern of badTextPatterns) {
    expect(pattern.test(text), `${path} contains error text matching ${pattern}`).toBeFalsy();
  }
  expect(pageErrors, `${path} page errors`).toEqual([]);
  expect(consoleErrors, `${path} console errors`).toEqual([]);
  expect(failedResponses, `${path} failed API/page responses`).toEqual([]);
}

async function loginAdminIfNeeded(page: Page) {
  const passwordInput = page.locator('input[type="password"]');
  await page.waitForSelector('input[type="password"], [data-testid="admin-left-nav"], .api-state', { timeout: 30_000 });
  if (await passwordInput.isVisible().catch(() => false)) {
    await passwordInput.fill(adminPassword);
    await passwordInput.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }
  await expect(passwordInput).toHaveCount(0, { timeout: 30_000 });
}

test.describe('MediaHub user journey smoke', () => {
  test('API data and main browser flows are usable for a normal user and admin', async ({ page }) => {
    const health = await apiGet('/api/health');
    expect(health.status).toBe('ok');

    for (const type of visibleTypes) {
      const result = await apiGet(`/api/contents?type=${type}&page=1&limit=5&keyword=&sort=hot&searchMode=local`);
      expect(result.data.list).toHaveLength(5);
      expect(result.data.pagination.total).toBeGreaterThanOrEqual(100);
    }

    const detailSeed = await apiGet('/api/contents?type=drama&page=1&limit=1&keyword=&sort=hot&searchMode=local');
    const detailId = detailSeed.data.list[0].id;

    await assertCleanPage(page, '/', { waitForRows: true });
    await assertCleanPage(page, '/dashboard', { waitForRows: true });

    for (const path of visibleTypes.map(type => `/${type}`)) {
      await assertCleanPage(page, path, { waitForRows: true });
      const rows = page.locator('.dashboard-rank-row:not(.is-loading)');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThanOrEqual(10);
      await rows.first().click();
      await expect(page.locator('.dashboard-rank-row[aria-current="true"]').first()).toBeVisible();
    }

    await assertCleanPage(page, `/detail/${encodeURIComponent(detailId)}`);

    await assertCleanPage(page, '/search');
    await page.locator('input').first().fill('非人哉');
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await expect(page.locator('body')).toContainText('非人哉');

    await assertCleanPage(page, '/admin');
    await loginAdminIfNeeded(page);
  });

  test('mobile viewport keeps dashboard and four module rankings usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await assertCleanPage(page, '/dashboard', { waitForRows: true });
    await expect(page.getByRole('heading', { name: '四模块数据看板' })).toBeVisible();

    for (const path of visibleTypes.map(type => `/${type}`)) {
      await assertCleanPage(page, path, { waitForRows: true });
      const rows = page.locator('.dashboard-rank-row:not(.is-loading)');
      await expect(rows.first()).toBeVisible();
      await rows.first().click();
      await expect(page.locator('.dashboard-rank-row[aria-current="true"]').first()).toBeVisible();
    }
  });

  test('admin can trigger queued refresh-all UI flow without launching a real crawler', async ({ page }) => {
    let refreshAllRequests = 0;
    let queuePolls = 0;
    const emptyQueue = {
      running: false,
      queueLength: 0,
      activeJob: null,
      queuedJobs: [],
      recentJobs: [],
      persistError: null,
      updatedAt: new Date().toISOString(),
    };
    const completedJob = {
      id: 'refresh-e2e-queued',
      trigger: 'e2e',
      types: [...visibleTypes],
      status: 'success',
      currentType: null,
      currentStage: 'completed',
      progress: { total: visibleTypes.length, completed: visibleTypes.length, failed: 0 },
      results: visibleTypes.map(type => ({
        type,
        status: 'success',
        count: 100,
        source: 'e2e_mock_dataset',
        jsonDataset: { fallbackUsed: false },
      })),
      error: null,
      enqueuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      backfill: { pageCount: 1, pageSize: 10, sortModes: ['hot'] },
    };

    await page.route('**/api/ingestion/jobs', async route => {
      const data = refreshAllRequests === 0
        ? emptyQueue
        : queuePolls++ === 0
          ? { ...emptyQueue, running: true, activeJob: { ...completedJob, status: 'running', currentType: 'drama', currentStage: 'fetching', progress: { total: 4, completed: 0, failed: 0 }, results: [] } }
          : { ...emptyQueue, recentJobs: [completedJob] };
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ code: 0, data }),
      });
    });

    await page.route('**/api/ingestion/refresh-all-queued', async route => {
      refreshAllRequests += 1;
      await route.fulfill({
        status: 202,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          code: 0,
          data: {
            job: { ...completedJob, status: 'queued', progress: { total: 4, completed: 0, failed: 0 }, results: [] },
            queue: { ...emptyQueue, running: true, activeJob: { ...completedJob, status: 'running', currentType: 'drama', progress: { total: 4, completed: 0, failed: 0 }, results: [] } },
          },
        }),
      });
    });

    await assertCleanPage(page, '/admin');
    await loginAdminIfNeeded(page);

    const refreshAllButton = page.getByTestId('admin-refresh-all-types');
    await expect(refreshAllButton).toBeVisible();
    await refreshAllButton.click();
    await expect(refreshAllButton).toBeDisabled();
    await expect(page.getByTestId('admin-refresh-queue-status')).toBeVisible();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('Queue refresh finished 4/4');

    for (const type of visibleTypes) {
      await expect(page.getByTestId(`admin-source-stage-${type}`)).toContainText('done');
    }
    expect(refreshAllRequests).toBe(1);
  });


  test('mobile search page is usable with real local data', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertCleanPage(page, '/search');
    await page.locator('input').first().fill('\u975e\u4eba\u54c9');
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await expect(page.locator('body')).toContainText('\u975e\u4eba\u54c9');
  });

  test('mobile detail page is usable for a normal user', async ({ page }) => {
    const detailSeed = await apiGet('/api/contents?type=drama&page=1&limit=1&keyword=&sort=hot&searchMode=local');
    const detailId = detailSeed.data.list[0].id;
    await page.setViewportSize({ width: 390, height: 844 });
    await assertCleanPage(page, `/detail/${encodeURIComponent(detailId)}`);
    await expect(page.locator('body')).not.toContainText('Cannot GET');
  });

  test('admin login failure is visible and recoverable', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('wrong-password');
    await page.locator('button').first().click();
    await expect(page.getByRole('alert')).toBeVisible();

    await passwordInput.fill(adminPassword);
    await page.locator('button').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('admin expired session 401 is shown as a retryable admin error', async ({ page }) => {
    const fulfillOk = (route: Route, data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ code: 0, data }),
    });
    const now = new Date().toISOString();
    const emptyQueue = { running: false, queueLength: 0, activeJob: null, queuedJobs: [], recentJobs: [], persistError: null, updatedAt: now };
    const emptyQuality = { total: 0, missingCover: 0, missingSummary: 0, missingTags: 0, lowHotScore: 0, qualityScore: 100, byType: [], duplicateCandidates: [], boundaryRisks: [], reviewQueue: [] };

    await page.route('**/api/admin/me', route => fulfillOk(route, { authenticated: true }));
    await page.route('**/api/system/admin-quality', route => fulfillOk(route, emptyQuality));
    await page.route('**/api/system/admin-logs?**', route => fulfillOk(route, { runs: [], errorSummary: {} }));
    await page.route('**/api/sources/status', route => fulfillOk(route, []));
    await page.route('**/api/system/auto-refresh/status', route => fulfillOk(route, {
      started: true,
      enabled: false,
      mode: 'daily',
      intervalMinutes: 1440,
      hour: 3,
      minute: 0,
      runOnStartup: false,
      scheduled: false,
      running: false,
      nextRunAt: null,
      lastRunAt: null,
      lastFinishedAt: null,
      lastTrigger: '',
      lastError: null,
      lastResults: [],
      updatedAt: now,
      backfill: { pageCount: 1, pageSize: 10, sortModes: ['hot'] },
    }));
    await page.route('**/api/ingestion/jobs', route => fulfillOk(route, emptyQueue));
    await page.route('**/api/system/json-data-status', route => fulfillOk(route, { types: [], indexes: { actor: 0, ip: 0, category: 0 } }));
    await page.route('**/api/system/json-data-preview?**', route => fulfillOk(route, {
      type: 'drama',
      file: '',
      exists: false,
      date: '',
      capturedAt: now,
      count: 0,
      items: [],
      latestLog: { file: '', date: '', updatedAt: now, runs: [] },
    }));

    await page.route('**/api/system/admin-summary', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          code: 1004,
          error: 'unauthorized',
          message: '\u5f53\u524d\u4f1a\u8bdd\u672a\u767b\u5f55\u6216\u5df2\u8fc7\u671f\u3002',
          data: null,
        }),
      });
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.api-state').first()).toContainText('当前会话未登录或已过期');
  });

  test('dashboard displays 429 rate-limit API error states without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/api/contents?**', route => route.fulfill({
      status: 429,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        code: 2003,
        message: '\u4e0a\u6e38\u9650\u6d41\u4e2d\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
        requestId: 'e2e-rate-limit',
        data: null,
      }),
    }));

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.api-state').first()).toContainText('\u4e0a\u6e38\u9650\u6d41\u4e2d');
    expect(pageErrors, '429 state should not throw page errors').toEqual([]);
    const unexpectedConsoleErrors = consoleErrors.filter(text => !text.includes('status of 429'));
    expect(unexpectedConsoleErrors, '429 state should not log unexpected console errors').toEqual([]);
  });


  test('dashboard displays retryable API error states without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/api/contents?**', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        code: 2002,
        message: '上游内容服务暂不可用，请稍后重试。',
        requestId: 'e2e-upstream-failure',
        data: null,
      }),
    }));

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.api-state').first()).toContainText('上游内容服务暂不可用');
    await expect(page.getByRole('button', { name: '刷新数据' }).first()).toBeVisible();
    expect(pageErrors, 'API failure state should not throw page errors').toEqual([]);
    expect(consoleErrors, 'API failure state should not log console errors').toEqual([]);
  });
});
