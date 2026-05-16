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

function seedRegressionData() {
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

  const contentRows = [];
  const types = ['drama', 'novel', 'comic', 'anime'];
  for (const type of types) {
    for (let i = 1; i <= 18; i += 1) {
      const id = `${type}:regression:${i}`;
      const title = `${type.toUpperCase()} 回归样本 ${i}`;
      contentRows.push({
        id,
        type,
        title,
        cover: `https://example.com/${type}-${i}.jpg`,
        summary: `用于回归测试的 ${type} 样本 ${i}`,
        author: `${type}-author`,
        ipName: `${type}-ip-${Math.ceil(i / 3)}`,
        status: i % 2 === 0 ? 'completed' : 'ongoing',
        hotScore: 20000 - i,
        tagsJson: JSON.stringify([`${type}-tag`, '回归']),
        actorsJson: JSON.stringify([`${type}-actor-${(i % 4) + 1}`]),
        sourceJson: JSON.stringify({ provider: 'regression', label: 'Regression Source', url: 'https://example.com' }),
        createdAt: now,
        updatedAt: now,
        cachedAt: now,
        normalizedTitle: title.toLowerCase(),
        dedupeHash: `regression-${type}-${i}`,
      });
    }
  }
  for (const row of contentRows) insertContent.run(row);

  db.close();
}

test.describe('MediaHub 全流程回归', () => {
  test.beforeAll(() => {
    seedRegressionData();
  });

  test('首页交互链路完整可用', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'MediaHub' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '为你推荐' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

    await page.getByRole('button', { name: '文 小说' }).click();
    await expect(page.getByRole('heading', { name: '热门内容' })).toBeVisible();

    await page.getByRole('button', { name: '最新' }).click();
    await page.getByRole('button', { name: '热度' }).click();

    const searchInput = page.getByPlaceholder('搜索内容、演员、作者、IP...');
    await searchInput.fill('回归样本 1');
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByText('关键词', { exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: '清空筛选' }).click();

    const firstCard = page.getByRole('button', { name: /^查看详情：/ }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/detail\//);
  });

  test('详情页关键按钮与列表模块可操作', async ({ page }) => {
    await page.goto('/detail/drama:regression:1');
    await expect(page.getByRole('heading', { name: 'DRAMA 回归样本 1', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: '标记已看' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '收藏' })).toHaveCount(0);
    await expect(page.getByText(/热度/).first()).toBeVisible();
  });

  test('后台所有关键按钮路径可达', async ({ page }) => {
    await loginAdmin(page);

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ai').click();
    await page.getByRole('button', { name: '保存 AI 配置' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('已保存');

    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-routing').click();
    await expect(page.getByTestId('admin-source-routing-effective-drama')).toContainText('当前链路：AI 热门检索');

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ingest').click();
    const dramaRefreshButton = page.getByTestId('admin-manual-refresh-drama');
    await dramaRefreshButton.click();
    await expect(dramaRefreshButton).toContainText(/刷新中...|手动获取\/入库/);
    await expect(page.getByTestId('admin-source-status-drama')).toContainText(/状态：(success|failed|暂无记录)/);
    await expect(page.getByTestId('admin-source-count-drama')).toContainText(/条数：\d+/);
    await expect(page.getByTestId('admin-feedback-message')).toContainText(/\S/);
    await expect(page.getByText('阶段：失败').or(page.getByText('阶段：完成'))).toBeVisible();

    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-routing').click();
    await expect(page.getByRole('heading', { name: 'AI 路由与健康' })).toBeVisible();
    await expect(page.locator('[data-testid^=\"admin-source-health-score-drama-\"]').first()
      .or(page.getByText('尚无数据源健康采样，可先执行手动获取/入库。')))
      .toBeVisible();
    await expect(page.getByRole('button', { name: '新增平台' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '爬虫采集（下拉选择）' })).toHaveCount(0);
  });

  test('后台 AI 入库与健康刷新流程可用', async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-routing').click();
    await page.getByRole('button', { name: '刷新健康状态' }).click();
    await expect(page.getByRole('button', { name: /刷新中...|刷新健康状态/ })).toBeVisible();

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ingest').click();
    await page.getByTestId('admin-manual-refresh-novel').click();
    await expect(page.getByTestId('admin-source-status-novel')).toContainText(/状态：(success|failed|暂无记录)/);
    await expect(page.getByTestId('admin-source-count-novel')).toContainText(/条数：\d+/);

    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-routing').click();
    await expect(page.getByTestId('admin-source-routing-effective-anime')).toContainText('当前链路：AI 热门检索');
  });

  test('后台系统设置每一项运行参数都可编辑保存', async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-system').click();

    await page.getByLabel('自动刷新').uncheck();
    await page.getByLabel('启动即刷新').check();
    await page.getByLabel('执行小时').fill('6');
    await page.getByLabel('执行分钟').fill('45');
    await page.getByLabel('补采页数').fill('4');
    await page.getByLabel('每页条数').fill('24');
    await page.getByLabel('排序：热度').check();
    await page.getByLabel('排序：最新').check();
    await page.getByLabel('缓存 TTL（毫秒）').fill('180000');
    await page.getByLabel('上游超时（毫秒）').fill('9000');
    await page.getByLabel('超时重试次数').fill('4');
    await page.getByLabel('重试基础退避（毫秒）').fill('650');
    await page.getByLabel('熔断失败阈值').fill('8');
    await page.getByLabel('熔断开启时间（毫秒）').fill('45000');
    await page.getByLabel('每秒限流').fill('12');
    await page.getByLabel('限流突发').fill('24');
    await page.getByRole('button', { name: '保存系统设置' }).click();

    await expect(page.getByTestId('admin-feedback-message')).toContainText('系统设置已保存');
    await expect(page.getByLabel('自动刷新')).not.toBeChecked();
    await expect(page.getByLabel('启动即刷新')).toBeChecked();
    await expect(page.getByLabel('执行小时')).toHaveValue('6');
    await expect(page.getByLabel('执行分钟')).toHaveValue('45');
    await expect(page.getByLabel('补采页数')).toHaveValue('4');
    await expect(page.getByLabel('每页条数')).toHaveValue('24');
    await expect(page.getByLabel('缓存 TTL（毫秒）')).toHaveValue('180000');
    await expect(page.getByLabel('上游超时（毫秒）')).toHaveValue('9000');
    await expect(page.getByLabel('超时重试次数')).toHaveValue('4');
    await expect(page.getByLabel('重试基础退避（毫秒）')).toHaveValue('650');
    await expect(page.getByLabel('熔断失败阈值')).toHaveValue('8');
    await expect(page.getByLabel('熔断开启时间（毫秒）')).toHaveValue('45000');
    await expect(page.getByLabel('每秒限流')).toHaveValue('12');
    await expect(page.getByLabel('限流突发')).toHaveValue('24');
    await expect(page.getByTestId('admin-setting-source-mode')).toContainText('仅 AI 模型');
  });

  test('后台规则参考每一项都可编辑保存', async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId('admin-nav-reference').click();
    await page.getByTestId('admin-tab-reference-prompt').click();
    await page.getByLabel('Prompt 版本 1').fill('v9.9');
    await page.getByLabel('Prompt 名称 1').fill('可编辑 Prompt');
    await page.getByLabel('Prompt 状态 1').fill('测试');
    await page.getByLabel('Prompt 内容 1').fill('只返回可解析 JSON，不要解释。');
    await page.getByRole('button', { name: '保存 Prompt 模板' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('Prompt 模板已保存');
    await expect(page.getByLabel('Prompt 名称 1')).toHaveValue('可编辑 Prompt');

    await page.getByTestId('admin-tab-reference-keywords').click();
    await page.getByLabel('热门关键词 1').fill('可编辑关键词');
    await page.getByRole('button', { name: '保存热门关键词' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('热门关键词已保存');
    await expect(page.getByLabel('热门关键词 1')).toHaveValue('可编辑关键词');

    await page.getByTestId('admin-tab-reference-rules').click();
    await page.getByLabel('推荐规则 1').fill('可编辑推荐规则');
    await page.getByRole('button', { name: '保存推荐规则' }).click();
    await expect(page.getByTestId('admin-feedback-message')).toContainText('推荐规则已保存');
    await expect(page.getByLabel('推荐规则 1')).toHaveValue('可编辑推荐规则');
  });

  test('移动端布局可操作且无明显遮挡', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'MediaHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: '后台管理' })).toBeVisible();

    await page.getByRole('button', { name: '文 小说' }).click();
    await page.getByRole('button', { name: /^查看详情：/ }).first().click();
    await expect(page).toHaveURL(/\/detail\//);

    await loginAdmin(page);
    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-ingest').click();
    await expect(page.getByRole('button', { name: '手动获取/入库' }).first()).toBeVisible();
  });
});
