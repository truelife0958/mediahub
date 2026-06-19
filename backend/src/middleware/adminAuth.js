import { createHash, timingSafeEqual } from 'node:crypto';
import { getCookie } from '../utils/cookies.js';
import { createApiError } from '../utils/apiErrors.js';
import { getAdminPassword, isSecureCookieEnabled } from '../utils/productionConfig.js';

const ADMIN_COOKIE = 'mediahub_admin';
const ADMIN_MAX_AGE_SECONDS = 12 * 60 * 60;

function hashPassword(password) {
  return createHash('sha256').update(String(password || '')).digest('hex');
}

function createAdminToken(password = getAdminPassword()) {
  return hashPassword(password);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyAdminPassword(password) {
  return safeEqual(hashPassword(password), createAdminToken());
}

function isAdminAuthenticated(req) {
  const token = getCookie(req, ADMIN_COOKIE);
  return safeEqual(token, createAdminToken());
}

function setAdminCookie(res) {
  res.cookie(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    maxAge: ADMIN_MAX_AGE_SECONDS * 1000,
    path: '/',
  });
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    path: '/',
  });
}

function requireAdmin(req, _res, next) {
  if (isAdminAuthenticated(req)) {
    next();
    return;
  }
  next(createApiError('unauthorized', 'Admin password required'));
}

export {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE_SECONDS,
  clearAdminCookie,
  isAdminAuthenticated,
  requireAdmin,
  setAdminCookie,
  verifyAdminPassword,
};
