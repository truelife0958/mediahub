import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getRecommendations } from '../services/recommendationService.js';
import { getCookie } from '../utils/cookies.js';
import { shapeContentResponse } from '../services/contentResponseService.js';

const router = express.Router();
const SESSION_COOKIE = 'mediahub_session';

router.get('/for-you', asyncHandler(async (req, res) => {
  const userId = req.query.userId || getCookie(req, SESSION_COOKIE);
  const data = await getRecommendations({ ...req.query, userId });
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

export default router;
