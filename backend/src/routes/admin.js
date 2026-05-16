import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  clearAdminCookie,
  isAdminAuthenticated,
  setAdminCookie,
  verifyAdminPassword,
} from '../middleware/adminAuth.js';
import { createApiError } from '../utils/apiErrors.js';

const router = express.Router();

router.get('/me', (req, res) => {
  res.json({ code: 0, data: { authenticated: isAdminAuthenticated(req) } });
});

router.post('/login', asyncHandler(async (req, res) => {
  const password = String(req.body?.password || '');
  if (!verifyAdminPassword(password)) {
    throw createApiError('unauthorized', 'Admin password is incorrect');
  }
  setAdminCookie(res);
  res.json({ code: 0, data: { authenticated: true } });
}));

router.post('/logout', (_req, res) => {
  clearAdminCookie(res);
  res.json({ code: 0, data: { loggedOut: true } });
});

export default router;
