import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getCookie } from '../utils/cookies.js';
import { createApiError } from '../utils/apiErrors.js';
import { getAdminPassword, isSecureCookieEnabled } from '../utils/productionConfig.js';

const ADMIN_COOKIE = 'mediahub_admin';
const ADMIN_MAX_AGE_SECONDS = 12 * 60 * 60;
const adminSessions = new Map();

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

function pruneAdminSessions(now = Date.now()) {
  for (const [token, session] of adminSessions.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) adminSessions.delete(token);
  }
}

function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

function isAdminAuthenticated(req) {
  pruneAdminSessions();
  const token = getCookie(req, ADMIN_COOKIE);
  const session = adminSessions.get(String(token || ''));
  if (!session) return false;
  if (session.passwordHash !== createAdminToken()) {
    adminSessions.delete(token);
    return false;
  }
  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function setAdminCookie(res) {
  pruneAdminSessions();
  const token = createSessionToken();
  adminSessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + ADMIN_MAX_AGE_SECONDS * 1000,
    passwordHash: createAdminToken(),
  });
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    maxAge: ADMIN_MAX_AGE_SECONDS * 1000,
    path: '/',
  });
}

function clearAdminCookie(res, req) {
  const token = req ? getCookie(req, ADMIN_COOKIE) : '';
  if (token) adminSessions.delete(token);
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

function resetAdminSessions() {
  adminSessions.clear();
}

export {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE_SECONDS,
  clearAdminCookie,
  createAdminToken,
  isAdminAuthenticated,
  requireAdmin,
  resetAdminSessions,
  setAdminCookie,
  verifyAdminPassword,
};
