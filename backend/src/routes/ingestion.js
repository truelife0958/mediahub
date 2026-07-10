import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { refreshAllContentTypesNow } from '../services/autoRefreshRuntimeService.js';
import {
  enqueueRefreshAllContentTypesJob,
  getRefreshJobQueueStatus,
  normalizeTypes,
} from '../services/refreshJobQueueService.js';
import { refreshContentType } from '../services/ingestionService.js';
import { validateContentType } from '../utils/requestValidation.js';

const router = express.Router();

function parseTypesParam(value) {
  if (Array.isArray(value)) return normalizeTypes(value);
  return normalizeTypes(String(value || '').split(','));
}


router.get('/jobs', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getRefreshJobQueueStatus() });
}));

router.post('/refresh-all-queued', asyncHandler(async (req, res) => {
  const rawTypes = req.body?.types || req.query.types;
  const job = enqueueRefreshAllContentTypesJob({
    trigger: req.body?.trigger || req.query.trigger || 'manual-queued',
    types: rawTypes ? parseTypesParam(rawTypes) : undefined,
  });
  res.status(202).json({ code: 0, data: { job, queue: getRefreshJobQueueStatus() } });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const type = validateContentType(req.query.type, { required: true });
  const data = await refreshContentType(type, {
    incremental: req.query.incremental,
  });
  res.json({ code: 0, data });
}));

router.post('/refresh-all', asyncHandler(async (_req, res) => {
  const data = await refreshAllContentTypesNow({ trigger: 'manual-all' });
  res.json({ code: 0, data });
}));

export default router;
