import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  markWatched,
  getWatchHistory,
  registerUser,
  toggleFavorite,
  getFavorites,
  getUserProfile,
  toggleFollow,
  getFollows,
  createKeywordSubscription,
  removeKeywordSubscription,
  getKeywordSubscriptions,
  getPreferenceProfile,
} from '../services/userService.js';
import { getCookie } from '../utils/cookies.js';
import { shapeContentResponse } from '../services/contentResponseService.js';
import { createApiError } from '../utils/apiErrors.js';
import { isSecureCookieEnabled } from '../utils/productionConfig.js';

const router = express.Router();
const SESSION_COOKIE = 'mediahub_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// Registration rate limit: 10 registrations per IP per 5 minutes
const REGISTER_RATE_LIMIT_MAX = 10;
const REGISTER_RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const registerAttempts = new Map();

function checkRegisterRateLimit(ip) {
  const now = Date.now();
  const record = registerAttempts.get(ip);
  if (!record || now - record.windowStart > REGISTER_RATE_LIMIT_WINDOW) {
    if (registerAttempts.size >= 5000) {
      for (const [key, val] of registerAttempts.entries()) {
        if (now - val.windowStart > REGISTER_RATE_LIMIT_WINDOW) registerAttempts.delete(key);
      }
      if (registerAttempts.size >= 5000) {
        const oldestKey = registerAttempts.keys().next().value;
        if (oldestKey !== undefined) registerAttempts.delete(oldestKey);
      }
    }
    registerAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  record.count += 1;
  return record.count <= REGISTER_RATE_LIMIT_MAX;
}

// Periodic cleanup of registration rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of registerAttempts.entries()) {
    if (now - record.windowStart > REGISTER_RATE_LIMIT_WINDOW) {
      registerAttempts.delete(ip);
    }
  }
}, 60_000).unref();

function getSessionUserId(req) {
  return getCookie(req, SESSION_COOKIE) || null;
}

function requireSessionUserId(req) {
  const userId = getSessionUserId(req);
  if (!userId) throw createApiError('unauthorized', 'Unauthorized');
  return userId;
}

function validateContentId(contentId) {
  if (!contentId || typeof contentId !== 'string' || contentId.length > 200 || !/^[a-zA-Z0-9:_-]+$/.test(contentId)) {
    throw createApiError('invalid_request', 'Invalid content ID');
  }
}

router.post('/register', asyncHandler(async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRegisterRateLimit(ip)) {
    throw createApiError('rate_limited', '注册过于频繁，请稍后再试', { statusCode: 429 });
  }
  const { username } = req.body;
  if (!username) throw createApiError('invalid_request', 'Missing username');
  const data = registerUser(username);
  res.cookie(SESSION_COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    maxAge: SESSION_MAX_AGE * 1000,
    path: '/',
  });
  res.json({ code: 0, data });
}));

router.post('/logout', asyncHandler(async (_req, res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    path: '/',
  });
  res.json({ code: 0, data: { loggedOut: true } });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.json({ code: 0, data: null });
    return;
  }
  const data = getUserProfile(userId);
  res.json({ code: 0, data });
}));

router.post('/history', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const { contentId } = req.body;
  validateContentId(contentId);
  const data = await markWatched(userId, contentId);
  res.json({ code: 0, data });
}));

router.post('/favorite', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const { contentId } = req.body;
  validateContentId(contentId);
  const data = await toggleFavorite(userId, contentId);
  res.json({ code: 0, data });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getWatchHistory(userId);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/favorites', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getFavorites(userId);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.post('/follow', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const { contentId } = req.body;
  validateContentId(contentId);
  const data = await toggleFollow(userId, contentId);
  res.json({ code: 0, data });
}));

router.get('/follows', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getFollows(userId);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/subscriptions', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getKeywordSubscriptions(userId);
  res.json({ code: 0, data });
}));

router.post('/subscriptions', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = createKeywordSubscription(userId, req.body || {});
  res.json({ code: 0, data });
}));

router.delete('/subscriptions/:id', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = removeKeywordSubscription(userId, req.params.id);
  res.json({ code: 0, data });
}));

router.get('/profile', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getPreferenceProfile(userId);
  res.json({ code: 0, data });
}));

export default router;
