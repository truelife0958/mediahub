import { getSourceRoutingSettingsSnapshot } from './sourceStrategyService.js';
import { createApiError } from '../utils/apiErrors.js';
import { writeEnvValues } from '../utils/envFile.js';

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || (max !== undefined && parsed > max)) return fallback;
  return parsed;
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

function getSystemSettingsSnapshot() {
  return {
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
      ttlMs: parseBoundedInteger(process.env.CACHE_TTL_MS, 180_000, 15_000),
      timeoutMs: parseBoundedInteger(process.env.UPSTREAM_TIMEOUT_MS, 10_000, 2_000),
      retryMaxAttempts: parseBoundedInteger(process.env.UPSTREAM_RETRY_MAX_ATTEMPTS, 2, 1, 5),
      retryBaseDelayMs: parseBoundedInteger(process.env.UPSTREAM_RETRY_BASE_DELAY_MS, 300, 0, 5_000),
      circuitBreakerFailureThreshold: parseBoundedInteger(process.env.UPSTREAM_CIRCUIT_BREAKER_FAILURE_THRESHOLD, 5, 1, 50),
      circuitBreakerOpenMs: parseBoundedInteger(process.env.UPSTREAM_CIRCUIT_BREAKER_OPEN_MS, 30_000, 1_000, 300_000),
      rateLimitPerSecond: parseBoundedInteger(process.env.UPSTREAM_RATE_LIMIT_PER_SECOND, 6, 1, 100),
      rateLimitBurst: parseBoundedInteger(process.env.UPSTREAM_RATE_LIMIT_BURST, 6, 1, 200),
    },
    sourceRouting: getSourceRoutingSettingsSnapshot(),
  };
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw createApiError('invalid_request', `${field} must be boolean`);
  }
  return value;
}

function normalizeInteger(value, field, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw createApiError('invalid_request', `${field} is out of range`);
  }
  return parsed;
}

function normalizeSortModes(value) {
  if (!Array.isArray(value)) {
    throw createApiError('invalid_request', 'ingestBackfill.sorts must be array');
  }
  const unique = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
  const invalid = unique.find(item => item !== 'hot' && item !== 'latest');
  if (invalid || unique.length === 0) {
    throw createApiError('invalid_request', 'ingestBackfill.sorts must contain hot or latest');
  }
  return unique;
}

function updateSystemSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createApiError('invalid_request', 'Invalid system settings payload');
  }

  const current = getSystemSettingsSnapshot();
  const next = {
    autoRefresh: { ...current.autoRefresh },
    ingestBackfill: { ...current.ingestBackfill },
    cache: { ...current.cache },
  };

  if (hasOwn(input, 'autoRefresh')) {
    if (!input.autoRefresh || typeof input.autoRefresh !== 'object' || Array.isArray(input.autoRefresh)) {
      throw createApiError('invalid_request', 'autoRefresh must be object');
    }
    if (hasOwn(input.autoRefresh, 'enabled')) next.autoRefresh.enabled = normalizeBoolean(input.autoRefresh.enabled, 'autoRefresh.enabled');
    if (hasOwn(input.autoRefresh, 'hour')) next.autoRefresh.hour = normalizeInteger(input.autoRefresh.hour, 'autoRefresh.hour', 0, 23);
    if (hasOwn(input.autoRefresh, 'minute')) next.autoRefresh.minute = normalizeInteger(input.autoRefresh.minute, 'autoRefresh.minute', 0, 59);
    if (hasOwn(input.autoRefresh, 'runOnStartup')) next.autoRefresh.runOnStartup = normalizeBoolean(input.autoRefresh.runOnStartup, 'autoRefresh.runOnStartup');
  }

  if (hasOwn(input, 'ingestBackfill')) {
    if (!input.ingestBackfill || typeof input.ingestBackfill !== 'object' || Array.isArray(input.ingestBackfill)) {
      throw createApiError('invalid_request', 'ingestBackfill must be object');
    }
    if (hasOwn(input.ingestBackfill, 'pages')) next.ingestBackfill.pages = normalizeInteger(input.ingestBackfill.pages, 'ingestBackfill.pages', 1, 10);
    if (hasOwn(input.ingestBackfill, 'pageSize')) next.ingestBackfill.pageSize = normalizeInteger(input.ingestBackfill.pageSize, 'ingestBackfill.pageSize', 1, 50);
    if (hasOwn(input.ingestBackfill, 'sorts')) next.ingestBackfill.sorts = normalizeSortModes(input.ingestBackfill.sorts);
  }

  if (hasOwn(input, 'cache')) {
    if (!input.cache || typeof input.cache !== 'object' || Array.isArray(input.cache)) {
      throw createApiError('invalid_request', 'cache must be object');
    }
    if (hasOwn(input.cache, 'ttlMs')) next.cache.ttlMs = normalizeInteger(input.cache.ttlMs, 'cache.ttlMs', 15_000);
    if (hasOwn(input.cache, 'timeoutMs')) next.cache.timeoutMs = normalizeInteger(input.cache.timeoutMs, 'cache.timeoutMs', 2_000);
    if (hasOwn(input.cache, 'retryMaxAttempts')) next.cache.retryMaxAttempts = normalizeInteger(input.cache.retryMaxAttempts, 'cache.retryMaxAttempts', 1, 5);
    if (hasOwn(input.cache, 'retryBaseDelayMs')) next.cache.retryBaseDelayMs = normalizeInteger(input.cache.retryBaseDelayMs, 'cache.retryBaseDelayMs', 0, 5_000);
    if (hasOwn(input.cache, 'circuitBreakerFailureThreshold')) next.cache.circuitBreakerFailureThreshold = normalizeInteger(input.cache.circuitBreakerFailureThreshold, 'cache.circuitBreakerFailureThreshold', 1, 50);
    if (hasOwn(input.cache, 'circuitBreakerOpenMs')) next.cache.circuitBreakerOpenMs = normalizeInteger(input.cache.circuitBreakerOpenMs, 'cache.circuitBreakerOpenMs', 1_000, 300_000);
    if (hasOwn(input.cache, 'rateLimitPerSecond')) next.cache.rateLimitPerSecond = normalizeInteger(input.cache.rateLimitPerSecond, 'cache.rateLimitPerSecond', 1, 100);
    if (hasOwn(input.cache, 'rateLimitBurst')) next.cache.rateLimitBurst = normalizeInteger(input.cache.rateLimitBurst, 'cache.rateLimitBurst', 1, 200);
  }

  writeEnvValues({
    MEDIAHUB_AUTO_REFRESH_ENABLED: next.autoRefresh.enabled,
    MEDIAHUB_AUTO_REFRESH_HOUR: next.autoRefresh.hour,
    MEDIAHUB_AUTO_REFRESH_MINUTE: next.autoRefresh.minute,
    MEDIAHUB_AUTO_REFRESH_ON_STARTUP: next.autoRefresh.runOnStartup,
    MEDIAHUB_INGEST_BACKFILL_PAGES: next.ingestBackfill.pages,
    MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: next.ingestBackfill.pageSize,
    MEDIAHUB_INGEST_BACKFILL_SORTS: next.ingestBackfill.sorts.join(','),
    CACHE_TTL_MS: next.cache.ttlMs,
    UPSTREAM_TIMEOUT_MS: next.cache.timeoutMs,
    UPSTREAM_RETRY_MAX_ATTEMPTS: next.cache.retryMaxAttempts,
    UPSTREAM_RETRY_BASE_DELAY_MS: next.cache.retryBaseDelayMs,
    UPSTREAM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: next.cache.circuitBreakerFailureThreshold,
    UPSTREAM_CIRCUIT_BREAKER_OPEN_MS: next.cache.circuitBreakerOpenMs,
    UPSTREAM_RATE_LIMIT_PER_SECOND: next.cache.rateLimitPerSecond,
    UPSTREAM_RATE_LIMIT_BURST: next.cache.rateLimitBurst,
  });

  return getSystemSettingsSnapshot();
}

export { getSystemSettingsSnapshot, updateSystemSettings };
