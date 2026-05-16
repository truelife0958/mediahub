import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAiConfigPublic, updateAiConfig } from '../services/aiConfigService.js';
import {
  getSourceRoutingSettingsSnapshot,
  upsertSourceChainOverride,
  clearSourceChainOverride,
} from '../services/sourceStrategyService.js';
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

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseRetryMaxAttempts() {
  return parseBoundedInteger(process.env.UPSTREAM_RETRY_MAX_ATTEMPTS, 2, 1, 5);
}

function parseRetryBaseDelayMs() {
  return parseBoundedInteger(process.env.UPSTREAM_RETRY_BASE_DELAY_MS, 300, 0, 5_000);
}

function parseBackfillSortModes(value) {
  const values = String(value || 'hot')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const unique = [...new Set(values)]
    .filter(item => item === 'hot' || item === 'latest');
  return unique.length > 0 ? unique : ['hot'];
}

router.get('/settings', asyncHandler(async (_req, res) => {
  const data = {
    autoRefresh: {
      enabled: parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ENABLED, true),
      hour: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_HOUR, 3, 0, 23),
      minute: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_MINUTE, 0, 0, 59),
      runOnStartup: parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP, true),
    },
    ingestBackfill: {
      pages: parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 3, 1, 10),
      pageSize: parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 30, 1, 50),
      sorts: parseBackfillSortModes(process.env.MEDIAHUB_INGEST_BACKFILL_SORTS),
    },
    cache: {
      ttlMs: Math.max(15_000, Number(process.env.CACHE_TTL_MS || 180_000)),
      timeoutMs: Math.max(2_000, Number(process.env.UPSTREAM_TIMEOUT_MS || 10_000)),
      retryMaxAttempts: parseRetryMaxAttempts(),
      retryBaseDelayMs: parseRetryBaseDelayMs(),
      circuitBreakerFailureThreshold: parseBoundedInteger(process.env.UPSTREAM_CIRCUIT_BREAKER_FAILURE_THRESHOLD, 5, 1, 50),
      circuitBreakerOpenMs: parseBoundedInteger(process.env.UPSTREAM_CIRCUIT_BREAKER_OPEN_MS, 30000, 1000, 300000),
      rateLimitPerSecond: parseBoundedInteger(process.env.UPSTREAM_RATE_LIMIT_PER_SECOND, 6, 1, 100),
      rateLimitBurst: parseBoundedInteger(process.env.UPSTREAM_RATE_LIMIT_BURST, 6, 1, 200),
    },
    sourceRouting: getSourceRoutingSettingsSnapshot(),
  };
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
