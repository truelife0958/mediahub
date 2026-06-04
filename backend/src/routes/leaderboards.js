import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  exportLeaderboard,
  getLayerConfig,
  getLeaderboard,
  getLeaderboardAlerts,
  getLeaderboardDiff,
  getLeaderboardTrends,
} from '../services/leaderboardService.js';

const router = express.Router();

router.get('/layers', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getLayerConfig() });
}));

router.get('/', asyncHandler(async (req, res) => {
  const data = await getLeaderboard({
    type: String(req.query.type || '').trim(),
    layer: String(req.query.layer || 'overall').trim(),
  });
  res.json({ code: 0, data });
}));

router.get('/trend', asyncHandler(async (req, res) => {
  const data = getLeaderboardTrends({
    type: String(req.query.type || '').trim(),
    layer: String(req.query.layer || 'overall').trim(),
    contentId: String(req.query.contentId || '').trim(),
    limit: req.query.limit,
  });
  res.json({ code: 0, data });
}));

router.get('/diff', asyncHandler(async (req, res) => {
  const data = getLeaderboardDiff({
    type: String(req.query.type || '').trim(),
    layer: String(req.query.layer || 'overall').trim(),
    baseCaptureId: String(req.query.baseCaptureId || '').trim(),
    compareCaptureId: String(req.query.compareCaptureId || '').trim(),
  });
  res.json({ code: 0, data });
}));

router.get('/alerts', asyncHandler(async (req, res) => {
  const data = getLeaderboardAlerts({
    type: String(req.query.type || '').trim(),
    layer: String(req.query.layer || '').trim(),
    eventType: String(req.query.eventType || '').trim(),
    limit: req.query.limit,
  });
  res.json({ code: 0, data });
}));

router.get('/export', asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'csv').trim().toLowerCase();
  const data = await exportLeaderboard({
    type: String(req.query.type || '').trim(),
    layer: String(req.query.layer || 'overall').trim(),
    captureId: String(req.query.captureId || '').trim(),
    format,
  });

  if (format === 'csv') {
    const filename = `leaderboard-${data.type}-${data.layer}-${String(data.captureId || 'latest').replace(/[^\w.-]+/g, '_')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(data.csv);
    return;
  }

  res.json({ code: 0, data });
}));

export default router;
