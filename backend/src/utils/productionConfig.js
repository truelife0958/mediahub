const DEFAULT_ADMIN_PASSWORD = 'MediaHub@2026';

function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function isSecureCookieEnabled() {
  return String(process.env.MEDIAHUB_COOKIE_SECURE || '').trim().toLowerCase() === 'true';
}

function getAdminPassword() {
  return String(process.env.MEDIAHUB_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
}

function assertProductionConfig() {
  if (!isProductionRuntime()) return;

  const adminPassword = getAdminPassword();
  if (!process.env.MEDIAHUB_ADMIN_PASSWORD || adminPassword === DEFAULT_ADMIN_PASSWORD || adminPassword.length < 12) {
    throw new Error('Production requires MEDIAHUB_ADMIN_PASSWORD with at least 12 characters and not the development default.');
  }
  if (!isSecureCookieEnabled()) {
    throw new Error('Production requires MEDIAHUB_COOKIE_SECURE=true.');
  }
  if (!process.env.MEDIAHUB_FRONTEND_URL) {
    throw new Error('Production requires MEDIAHUB_FRONTEND_URL.');
  }
}

export {
  DEFAULT_ADMIN_PASSWORD,
  assertProductionConfig,
  getAdminPassword,
  isProductionRuntime,
  isSecureCookieEnabled,
};
