const { test, expect } = require('playwright/test');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_FILE = process.env.MEDIAHUB_DB_PATH || path.resolve(__dirname, '../backend/data/mediahub.sqlite');
const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

function seedAdminUxData() {
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

  for (let index = 1; index <= 6; index += 1) {
    const title = `ANIME 后台抛光样本 UXKEY${index}`;
    insertContent.run({
      id: `anime:admin-ux:${index}`,
      type: 'anime',
      title,
      cover: '',
      summary: `用于后台交互抛光测试的动漫样本 ${index}`,
      author: 'admin-ux-author',
      ipName: `admin-ux-ip-${Math.ceil(index / 2)}`,
      status: index % 2 === 0 ? 'completed' : 'ongoing',
      hotScore: 30_000 - index,
      tagsJson: JSON.stringify(['后台抛光', '动漫']),
      actorsJson: JSON.stringify([`actor-${index}`]),
      sourceJson: JSON.stringify({ provider: 'admin-ux', label: 'Admin UX Seed' }),
      createdAt: now,
      updatedAt: now,
      cachedAt: now,
      normalizedTitle: title.toLowerCase(),
      dedupeHash: `admin-ux-anime-${index}`,
    });
  }

  db.close();
}

async function loginAdmin(page) {
  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录后台' }).click();
  await expect(page.getByTestId('admin-left-nav')).toBeVisible();
}

test.describe('admin UX polish', () => {
  test.beforeAll(() => {
    seedAdminUxData();
  });

  test('remembers tabs, supports Enter search, can clear filters, and protects unsaved editor changes', async ({ page }) => {
    await loginAdmin(page);

    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-logs').click();
    await expect(page.getByTestId('admin-panel-monitor-logs')).toBeVisible();

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-library').click();
    const searchInput = page.getByPlaceholder('搜索标题/IP');
    await searchInput.fill('UXKEY6');
    await searchInput.press('Enter');
    await expect(page.getByRole('button', { name: '编辑内容：ANIME 后台抛光样本 UXKEY6' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^编辑内容：/ })).toHaveCount(1);
    await page.getByRole('button', { name: '清空' }).click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByRole('button', { name: '编辑内容：ANIME 后台抛光样本 UXKEY1' })).toBeVisible();

    await page.getByTestId('admin-nav-monitor').click();
    await expect(page.getByTestId('admin-panel-monitor-logs')).toBeVisible();

    await page.getByTestId('admin-nav-operate').click();
    await page.getByRole('button', { name: '编辑内容：ANIME 后台抛光样本 UXKEY6' }).click();
    const editorDialog = page.getByRole('dialog', { name: '编辑内容' });
    await expect(editorDialog).toBeVisible();
    const titleInput = editorDialog.getByRole('textbox', { name: '标题' });
    await titleInput.fill('ANIME 后台抛光样本 UXKEY6 - 未保存');
    await page.keyboard.press('Escape');
    await expect(editorDialog).toBeVisible();
    await expect(page.getByText('有未保存修改，关闭后本次编辑内容会丢失。')).toBeVisible();
    await page.getByRole('button', { name: '放弃修改' }).click();
    await expect(editorDialog).toHaveCount(0);

    await page.getByRole('button', { name: '编辑内容：ANIME 后台抛光样本 UXKEY6' }).click();
    await expect(page.getByRole('dialog', { name: '编辑内容' }).getByRole('textbox', { name: '标题' })).toHaveValue('ANIME 后台抛光样本 UXKEY6');
  });

  test('wraps monitor tabs on mobile without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await loginAdmin(page);

    await page.getByTestId('admin-nav-monitor').click();
    const metrics = await page.getByTestId('admin-right-tabs').evaluate((element) => {
      const buttons = Array.from(element.querySelectorAll('button'));
      const rowOffsets = [...new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top)))];
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        rows: rowOffsets.length,
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.rows).toBeGreaterThan(1);
  });

  test('shows dirty-state save and reset controls in editor, system settings, and reference forms', async ({ page }) => {
    await loginAdmin(page);

    await page.getByTestId('admin-nav-operate').click();
    await page.getByTestId('admin-tab-operate-library').click();
    await page.getByRole('button', { name: /^编辑内容：/ }).first().click();
    const editorDialog = page.getByRole('dialog', { name: '编辑内容' });
    const editorSave = editorDialog.getByRole('button', { name: '保存内容' });
    await expect(editorSave).toBeDisabled();
    await editorDialog.getByRole('textbox', { name: '标题' }).fill('后台抛光标题 - dirty');
    await expect(editorSave).toBeEnabled();
    await editorDialog.getByRole('button', { name: '恢复原值' }).click();
    await expect(editorSave).toBeDisabled();
    await editorDialog.getByRole('button', { name: '关闭编辑' }).click();
    await expect(editorDialog).toHaveCount(0);

    await page.getByTestId('admin-nav-monitor').click();
    await page.getByTestId('admin-tab-monitor-system').click();
    const systemPanel = page.getByTestId('admin-panel-monitor-system');
    const systemSave = systemPanel.getByRole('button', { name: '保存系统设置' });
    await expect(systemSave).toBeDisabled();
    await systemPanel.getByLabel('自动刷新').click();
    await expect(systemSave).toBeEnabled();
    await systemPanel.getByRole('button', { name: '重置改动' }).click();
    await expect(systemSave).toBeDisabled();

    await page.getByTestId('admin-nav-reference').click();
    await page.getByTestId('admin-tab-reference-prompt').click();
    const promptPanel = page.getByTestId('admin-panel-reference-prompt');
    const promptSave = promptPanel.getByRole('button', { name: '保存 Prompt 模板' });
    await expect(promptSave).toBeDisabled();
    await promptPanel.getByRole('textbox', { name: 'Prompt 名称 1' }).fill('Prompt 名称 1 - dirty');
    await expect(promptSave).toBeEnabled();
    await promptPanel.getByRole('button', { name: '重置改动' }).click();
    await expect(promptSave).toBeDisabled();
  });

  test('keeps focus while typing in reference editors', async ({ page }) => {
    await loginAdmin(page);

    await page.getByTestId('admin-nav-reference').click();

    await page.getByTestId('admin-tab-reference-prompt').click();
    const promptName = page.getByTestId('admin-panel-reference-prompt').getByRole('textbox', { name: 'Prompt 名称 1' });
    await promptName.click();
    await promptName.pressSequentially('A');
    await expect(promptName).toBeFocused();

    await page.getByTestId('admin-tab-reference-keywords').click();
    const keywordInput = page.getByTestId('admin-panel-reference-keywords').getByRole('textbox', { name: '热门关键词 1' });
    await keywordInput.click();
    await keywordInput.pressSequentially('A');
    await expect(keywordInput).toBeFocused();

    await page.getByTestId('admin-tab-reference-rules').click();
    const ruleInput = page.getByTestId('admin-panel-reference-rules').getByRole('textbox', { name: '推荐规则 1' });
    await ruleInput.click();
    await ruleInput.pressSequentially('A');
    await expect(ruleInput).toBeFocused();
  });
});
