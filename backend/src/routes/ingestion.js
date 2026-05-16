import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { refreshContentType } from '../services/ingestionService.js';
import { createApiError } from '../utils/apiErrors.js';

const router = express.Router();

router.post('/refresh', asyncHandler(async (req, res) => {
  const type = String(req.query.type || '');
  const data = await refreshContentType(type, {
    incremental: req.query.incremental,
  });
  res.json({ code: 0, data });
}));

router.post('/crawl', asyncHandler(async (req, res) => {
  throw createApiError('invalid_request', '平台采集链路已废弃，请使用 /api/ingestion/refresh');
}));

export default router;
