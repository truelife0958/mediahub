import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAutoRefreshRuntimeStatus } from '../services/autoRefreshRuntimeService.js';
import { getHotDatasetPreview, getHotDatasetStatus } from '../services/hotDatasetService.js';
import {
  resolveAdminLogs,
  resolveAdminQuality,
  resolveAdminSummary,
} from '../services/adminService.js';

const router = express.Router();

router.get('/auto-refresh/status', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getAutoRefreshRuntimeStatus() });
}));

router.get('/json-data-status', asyncHandler(async (_req, res) => {
  const data = await getHotDatasetStatus();
  res.json({ code: 0, data });
}));

router.get('/json-data-preview', asyncHandler(async (req, res) => {
  const data = await getHotDatasetPreview({
    type: String(req.query.type || 'drama'),
    limit: req.query.limit,
  });
  res.json({ code: 0, data });
}));

router.get('/admin-summary', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: await resolveAdminSummary() });
}));

router.get('/admin-quality', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: await resolveAdminQuality() });
}));

router.get('/admin-logs', asyncHandler(async (req, res) => {
  const data = await resolveAdminLogs(req.query || {});
  res.json({ code: 0, data });
}));

export default router;
