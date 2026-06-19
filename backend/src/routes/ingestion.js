import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { refreshAllContentTypesNow } from '../services/autoRefreshRuntimeService.js';
import { refreshContentType } from '../services/ingestionService.js';
import { fetchListByType } from '../services/catalogService.js';

const BACKFILL_AI_TIMEOUT_MS = Math.max(5_000, Number(process.env.MEDIAHUB_BACKFILL_AI_TIMEOUT_MS || 20_000));

const router = express.Router();

router.post('/refresh', asyncHandler(async (req, res) => {
  const type = String(req.query.type || '');
  const keyword = String(req.query.keyword || '').trim();
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 30);
  const sort = String(req.query.sort || 'hot').trim() || 'hot';
  const data = await refreshContentType(type, {
    incremental: req.query.incremental,
    loader: keyword
      ? () => fetchListByType({
        type,
        keyword,
        page,
        limit,
        sort,
        __bypassCacheFallback: true,
        aiTimeoutMs: BACKFILL_AI_TIMEOUT_MS,
      })
      : undefined,
  });
  res.json({ code: 0, data });
}));

router.post('/refresh-all', asyncHandler(async (_req, res) => {
  const data = await refreshAllContentTypesNow({ trigger: 'manual-all' });
  res.json({ code: 0, data });
}));

export default router;
