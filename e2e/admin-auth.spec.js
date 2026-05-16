const { test, expect } = require('playwright/test');

const ADMIN_PASSWORD = process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026';

test.describe('admin authentication gate', () => {
  test('blocks access until password login and provides return/logout entries', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回前台' }).first()).toBeVisible();

    await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录后台' }).click();

    await expect(page.getByTestId('admin-left-nav')).toBeVisible();
    await expect(page.getByRole('link', { name: '返回前台' })).toBeVisible();
    await expect(page.getByRole('button', { name: '退出后台' })).toBeVisible();

    await page.getByRole('button', { name: '退出后台' }).click();
    await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  });

  test('shows login error for invalid password', async ({ page }) => {
    await page.goto('/admin');

    await page.getByLabel('管理员密码').fill('wrong-password');
    await page.getByRole('button', { name: '登录后台' }).click();

    await expect(page.getByText('管理员密码错误')).toBeVisible();
    await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  });
});
