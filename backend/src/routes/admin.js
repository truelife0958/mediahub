import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  clearAdminCookie,
  isAdminAuthenticated,
  resetAdminSessions,
  setAdminCookie,
  verifyAdminPassword,
} from '../middleware/adminAuth.js';
import { createApiError } from '../utils/apiErrors.js';

const router = express.Router();

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ENTRIES = 10_000;
const loginAttempts = new Map();

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.windowStart > LOGIN_RATE_LIMIT_WINDOW) {
    // Evict expired entries first, then oldest if still over capacity
    if (loginAttempts.size >= LOGIN_RATE_LIMIT_MAX_ENTRIES) {
      for (const [key, val] of loginAttempts.entries()) {
        if (now - val.windowStart > LOGIN_RATE_LIMIT_WINDOW) loginAttempts.delete(key);
      }
      if (loginAttempts.size >= LOGIN_RATE_LIMIT_MAX_ENTRIES) {
        const oldestKey = loginAttempts.keys().next().value;
        if (oldestKey !== undefined) loginAttempts.delete(oldestKey);
      }
    }
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  record.count += 1;
  if (record.count > LOGIN_RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now - record.windowStart > LOGIN_RATE_LIMIT_WINDOW) {
      loginAttempts.delete(ip);
    }
  }
}, 60_000).unref();

function resetLoginRateLimit() {
  loginAttempts.clear();
  resetAdminSessions();
}

router.post('/login', asyncHandler(async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(ip)) {
    throw createApiError('rate_limited', '登录尝试过于频繁，请稍后再试', { statusCode: 429 });
  }
  const password = String(req.body?.password || '');
  if (!verifyAdminPassword(password)) {
    throw createApiError('unauthorized', 'Admin password is incorrect');
  }
  loginAttempts.delete(ip);
  setAdminCookie(res);
  res.json({ code: 0, data: { authenticated: true } });
}));

router.post('/logout', (req, res) => {
  clearAdminCookie(res, req);
  res.json({ code: 0, data: { loggedOut: true } });
});

router.get('/me', (req, res) => {
  res.json({ code: 0, data: { authenticated: isAdminAuthenticated(req) } });
});

export default router;

export { resetLoginRateLimit };
