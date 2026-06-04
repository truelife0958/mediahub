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
import {
  captureLeaderboardForAllTypes,
  createSubscription,
  getLeaderboardAnomalies,
  listAuditRecords,
  listRevisions,
  listSubscriptionAlertHits,
  listSubscriptions,
  removeSubscription,
  recordAuditEntry,
  updateSubscription,
} from '../services/leaderboardService.js';
import {
  createSearchAliasGroup,
  deleteSearchAliasGroup,
  listSearchAliasGroups,
  updateSearchAliasGroup,
} from '../services/searchAliasService.js';

const router = express.Router();

router.get('/settings', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getSystemSettingsSnapshot() });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const data = updateSystemSettings(req.body || {});
  recordAuditEntry({
    action: 'system.settings.update',
    entityType: 'system_settings',
    entityId: 'runtime',
    actor: 'admin',
    requestId: req.requestId || '',
    details: req.body || {},
  });
  res.json({ code: 0, data });
}));

router.get('/reference-settings', asyncHandler(async (_req, res) => {
  res.json({ code: 0, data: getReferenceSettings() });
}));

router.put('/reference-settings', asyncHandler(async (req, res) => {
  const data = updateReferenceSettings(req.body || {});
  recordAuditEntry({
    action: 'system.reference.update',
    entityType: 'reference_settings',
    entityId: 'default',
    actor: 'admin',
    requestId: req.requestId || '',
    details: req.body || {},
  });
  res.json({ code: 0, data });
}));

router.get('/search-aliases', asyncHandler(async (req, res) => {
  const data = listSearchAliasGroups({
    type: req.query.type,
    enabled: req.query.enabled === undefined ? undefined : String(req.query.enabled).trim().toLowerCase() === 'true',
  });
  res.json({ code: 0, data });
}));

router.post('/search-aliases', asyncHandler(async (req, res) => {
  const data = createSearchAliasGroup(req.body || {});
  recordAuditEntry({
    action: 'system.search-alias.create',
    entityType: 'search_alias_group',
    entityId: String(data.id),
    actor: 'admin',
    requestId: req.requestId || '',
    details: data,
  });
  res.json({ code: 0, data });
}));

router.put('/search-aliases/:id', asyncHandler(async (req, res) => {
  const data = updateSearchAliasGroup(req.params.id, req.body || {});
  recordAuditEntry({
    action: 'system.search-alias.update',
    entityType: 'search_alias_group',
    entityId: String(data.id),
    actor: 'admin',
    requestId: req.requestId || '',
    details: data,
  });
  res.json({ code: 0, data });
}));

router.delete('/search-aliases/:id', asyncHandler(async (req, res) => {
  const data = deleteSearchAliasGroup(req.params.id);
  recordAuditEntry({
    action: 'system.search-alias.delete',
    entityType: 'search_alias_group',
    entityId: String(req.params.id || '').trim(),
    actor: 'admin',
    requestId: req.requestId || '',
    details: data,
  });
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
  recordAuditEntry({
    action: 'system.source-routing.update',
    entityType: 'source_routing',
    entityId: String(payload.type || '').trim(),
    actor: 'admin',
    requestId: req.requestId || '',
    details: payload,
  });
  res.json({ code: 0, data });
}));

router.delete('/source-routing/:type', asyncHandler(async (req, res) => {
  const data = clearSourceChainOverride(req.params.type);
  recordAuditEntry({
    action: 'system.source-routing.clear',
    entityType: 'source_routing',
    entityId: String(req.params.type || '').trim(),
    actor: 'admin',
    requestId: req.requestId || '',
    details: {},
  });
  res.json({ code: 0, data });
}));

router.get('/ai-config', asyncHandler(async (_req, res) => {
  const data = getAiConfigPublic();
  res.json({ code: 0, data });
}));

router.put('/ai-config', asyncHandler(async (req, res) => {
  const data = updateAiConfig(req.body || {});
  recordAuditEntry({
    action: 'system.ai-config.update',
    entityType: 'ai_config',
    entityId: 'runtime',
    actor: 'admin',
    requestId: req.requestId || '',
    details: {
      ...req.body,
      apiKey: req.body?.apiKey ? '***' : undefined,
    },
  });
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

router.get('/leaderboard-anomalies', asyncHandler(async (req, res) => {
  const data = getLeaderboardAnomalies({
    type: req.query.type,
    layer: req.query.layer,
  });
  res.json({ code: 0, data });
}));

router.post('/leaderboards/capture', asyncHandler(async (req, res) => {
  const data = await captureLeaderboardForAllTypes({
    actor: 'admin',
    requestId: req.requestId || '',
  });
  res.json({ code: 0, data });
}));

router.get('/subscriptions', asyncHandler(async (req, res) => {
  const data = listSubscriptions({
    type: req.query.type,
    enabled: req.query.enabled === undefined ? undefined : String(req.query.enabled).trim().toLowerCase() === 'true',
  });
  res.json({ code: 0, data });
}));

router.post('/subscriptions', asyncHandler(async (req, res) => {
  const data = createSubscription(req.body || {}, {
    actor: 'admin',
    requestId: req.requestId || '',
  });
  res.json({ code: 0, data });
}));

router.put('/subscriptions/:id', asyncHandler(async (req, res) => {
  const data = updateSubscription(req.params.id, req.body || {}, {
    actor: 'admin',
    requestId: req.requestId || '',
  });
  res.json({ code: 0, data });
}));

router.delete('/subscriptions/:id', asyncHandler(async (req, res) => {
  const data = removeSubscription(req.params.id, {
    actor: 'admin',
    requestId: req.requestId || '',
  });
  res.json({ code: 0, data });
}));

router.get('/subscription-hits', asyncHandler(async (req, res) => {
  const data = listSubscriptionAlertHits({
    type: req.query.type,
    keyword: req.query.keyword,
    limit: req.query.limit,
  });
  res.json({ code: 0, data });
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const data = listAuditRecords({
    action: req.query.action,
    entityType: req.query.entityType,
    limit: req.query.limit,
  });
  res.json({ code: 0, data });
}));

router.get('/content-revisions/:id', asyncHandler(async (req, res) => {
  const data = listRevisions(req.params.id, { limit: req.query.limit });
  res.json({ code: 0, data });
}));

export default router;
