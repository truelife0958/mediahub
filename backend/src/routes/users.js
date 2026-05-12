import express from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  markWatched,
  getWatchHistory,
  registerUser,
  toggleFavorite,
  getFavorites,
  getUserProfile,
} from '../services/userService.js';
import { getCookie } from '../utils/cookies.js';

const router = express.Router();
const SESSION_COOKIE = 'mediahub_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function getSessionUserId(req) {
  return getCookie(req, SESSION_COOKIE) || null;
}

function requireSessionUserId(req) {
  const userId = getSessionUserId(req);
  if (!userId) throw new AppError('Unauthorized', 401, 1004);
  return userId;
}

router.post('/register', asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username) throw new AppError('Missing username', 400, 1001);
  const data = registerUser(username);
  res.cookie(SESSION_COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE * 1000,
    path: '/',
  });
  res.json({ code: 0, data });
}));

router.post('/logout', asyncHandler(async (_req, res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
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
  const data = await markWatched(userId, contentId);
  res.json({ code: 0, data });
}));

router.post('/favorite', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const { contentId } = req.body;
  const data = await toggleFavorite(userId, contentId);
  res.json({ code: 0, data });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getWatchHistory(userId);
  res.json({ code: 0, data });
}));

router.get('/favorites', asyncHandler(async (req, res) => {
  const userId = requireSessionUserId(req);
  const data = getFavorites(userId);
  res.json({ code: 0, data });
}));

export default router;
