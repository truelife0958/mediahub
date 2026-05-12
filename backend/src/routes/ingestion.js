import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { refreshContentType } from '../services/ingestionService.js';

const router = express.Router();

router.post('/refresh', asyncHandler(async (req, res) => {
  const type = String(req.query.type || '');
  const data = await refreshContentType(type);
  res.json({ code: 0, data });
}));

export default router;
