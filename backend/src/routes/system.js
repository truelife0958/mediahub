import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAiConfigPublic, updateAiConfig } from '../services/aiConfigService.js';
import {
  getSourceRoutingSettingsSnapshot,
  upsertSourceChainOverride,
  clearSourceChainOverride,
} from '../services/sourceStrategyService.js';
import { getSystemSettingsSnapshot, updateSystemSettings } from '../services/systemSettingsService.js';
import { getReferenceSettings, updateReferenceSettings } from '../services/referenceSettingsService.js';
import {
  buildAdminSummary,
  getAdminLogs,
  getAdminQuality,
  listAdminContents,
  createAdminContent,
  updateAdminContent,
  fillMissingAdminContentWithAi,
} from '../services/adminService.js';

const router = express.Router();

router.get('/settings', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getSystemSettingsSnapshot() });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const data = updateSystemSettings(req.body || {});
  res.json({ code: 0, data });
}));

router.get('/reference-settings', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getReferenceSettings() });
}));

router.put('/reference-settings', asyncHandler(async (req, res) => {
  const data = updateReferenceSettings(req.body || {});
  res.json({ code: 0, data });
}));

router.get('/source-routing', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getSourceRoutingSettingsSnapshot() });
}));

router.put('/source-routing', asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const data = upsertSourceChainOverride({
    type: payload.type,
    chain: payload.chain,
  });
  res.json({ code: 0, data });
}));

router.delete('/source-routing/:type', asyncHandler(async (req, res) => {
  const data = clearSourceChainOverride(req.params.type);
  res.json({ code: 0, data });
}));

router.get('/ai-config', asyncHandler(async (_req, res) => {
  const data = getAiConfigPublic();
  res.json({ code: 0, data });
}));

router.put('/ai-config', asyncHandler(async (req, res) => {
  const data = updateAiConfig(req.body || {});
  res.json({ code: 0, data });
}));

router.get('/admin-summary', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: buildAdminSummary() });
}));

router.get('/admin-contents', asyncHandler(async (req, res) => {
  const data = listAdminContents(req.query || {});
  res.json({ code: 0, data });
}));

router.post('/admin-contents', asyncHandler(async (req, res) => {
  const data = createAdminContent(req.body || {});
  res.json({ code: 0, data });
}));

router.put('/admin-contents/:id', asyncHandler(async (req, res) => {
  const data = updateAdminContent(req.params.id, req.body || {});
  res.json({ code: 0, data });
}));

router.post('/admin-contents/:id/fill-missing', asyncHandler(async (req, res) => {
  const data = await fillMissingAdminContentWithAi(req.params.id);
  res.json({ code: 0, data });
}));

router.get('/admin-quality', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getAdminQuality() });
}));

router.get('/admin-logs', asyncHandler(async (req, res) => {
  const data = getAdminLogs(req.query || {});
  res.json({ code: 0, data });
}));

export default router;
