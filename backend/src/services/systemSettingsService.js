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

function parseAutoRefreshMode(value, fallback = 'daily') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'interval' || normalized === 'realtime') return 'interval';
  if (normalized === 'daily') return 'daily';
  return fallback;
}

function getSystemSettingsSnapshot() {
  return {
    autoRefresh: {
      enabled: parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ENABLED, true),
      mode: parseAutoRefreshMode(process.env.MEDIAHUB_AUTO_REFRESH_MODE, 'daily'),
      intervalMinutes: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES, 10, 1, 1440),
      failureBackoffEnabled: parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_ENABLED, true),
      failureBackoffMultiplier: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MULTIPLIER, 2, 2, 8),
      failureBackoffMaxMinutes: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MAX_MINUTES, 60, 1, 1440),
      hour: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_HOUR, 3, 0, 23),
      minute: parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_MINUTE, 0, 0, 59),
      runOnStartup: parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP, true),
    },
    ingestBackfill: {
      pages: parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 2, 1, 10),
      pageSize: parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 50, 1, 50),
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
    notifications: {
      webhookEnabled: parseBoolean(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_ENABLED, false),
      webhookTimeoutMs: parseBoundedInteger(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_TIMEOUT_MS, 5_000, 1_000, 30_000),
      webhookRetryMaxAttempts: parseBoundedInteger(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_MAX_ATTEMPTS, 3, 1, 6),
      webhookRetryBaseDelayMs: parseBoundedInteger(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_BASE_DELAY_MS, 500, 0, 10_000),
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

function normalizeAutoRefreshMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'daily' || normalized === 'interval') return normalized;
  throw createApiError('invalid_request', 'autoRefresh.mode must be daily or interval');
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
    notifications: { ...current.notifications },
  };

  if (hasOwn(input, 'autoRefresh')) {
    if (!input.autoRefresh || typeof input.autoRefresh !== 'object' || Array.isArray(input.autoRefresh)) {
      throw createApiError('invalid_request', 'autoRefresh must be object');
    }
    if (hasOwn(input.autoRefresh, 'enabled')) next.autoRefresh.enabled = normalizeBoolean(input.autoRefresh.enabled, 'autoRefresh.enabled');
    if (hasOwn(input.autoRefresh, 'mode')) next.autoRefresh.mode = normalizeAutoRefreshMode(input.autoRefresh.mode);
    if (hasOwn(input.autoRefresh, 'intervalMinutes')) {
      next.autoRefresh.intervalMinutes = normalizeInteger(input.autoRefresh.intervalMinutes, 'autoRefresh.intervalMinutes', 1, 1440);
    }
    if (hasOwn(input.autoRefresh, 'failureBackoffEnabled')) {
      next.autoRefresh.failureBackoffEnabled = normalizeBoolean(input.autoRefresh.failureBackoffEnabled, 'autoRefresh.failureBackoffEnabled');
    }
    if (hasOwn(input.autoRefresh, 'failureBackoffMultiplier')) {
      next.autoRefresh.failureBackoffMultiplier = normalizeInteger(
        input.autoRefresh.failureBackoffMultiplier,
        'autoRefresh.failureBackoffMultiplier',
        2,
        8,
      );
    }
    if (hasOwn(input.autoRefresh, 'failureBackoffMaxMinutes')) {
      next.autoRefresh.failureBackoffMaxMinutes = normalizeInteger(
        input.autoRefresh.failureBackoffMaxMinutes,
        'autoRefresh.failureBackoffMaxMinutes',
        1,
        1440,
      );
    }
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

  if (hasOwn(input, 'notifications')) {
    if (!input.notifications || typeof input.notifications !== 'object' || Array.isArray(input.notifications)) {
      throw createApiError('invalid_request', 'notifications must be object');
    }
    if (hasOwn(input.notifications, 'webhookEnabled')) {
      next.notifications.webhookEnabled = normalizeBoolean(input.notifications.webhookEnabled, 'notifications.webhookEnabled');
    }
    if (hasOwn(input.notifications, 'webhookTimeoutMs')) {
      next.notifications.webhookTimeoutMs = normalizeInteger(input.notifications.webhookTimeoutMs, 'notifications.webhookTimeoutMs', 1_000, 30_000);
    }
    if (hasOwn(input.notifications, 'webhookRetryMaxAttempts')) {
      next.notifications.webhookRetryMaxAttempts = normalizeInteger(input.notifications.webhookRetryMaxAttempts, 'notifications.webhookRetryMaxAttempts', 1, 6);
    }
    if (hasOwn(input.notifications, 'webhookRetryBaseDelayMs')) {
      next.notifications.webhookRetryBaseDelayMs = normalizeInteger(input.notifications.webhookRetryBaseDelayMs, 'notifications.webhookRetryBaseDelayMs', 0, 10_000);
    }
  }

  writeEnvValues({
    MEDIAHUB_AUTO_REFRESH_ENABLED: next.autoRefresh.enabled,
    MEDIAHUB_AUTO_REFRESH_MODE: next.autoRefresh.mode,
    MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES: next.autoRefresh.intervalMinutes,
    MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_ENABLED: next.autoRefresh.failureBackoffEnabled,
    MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MULTIPLIER: next.autoRefresh.failureBackoffMultiplier,
    MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MAX_MINUTES: next.autoRefresh.failureBackoffMaxMinutes,
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
    MEDIAHUB_WEBHOOK_NOTIFICATIONS_ENABLED: next.notifications.webhookEnabled,
    MEDIAHUB_WEBHOOK_NOTIFICATIONS_TIMEOUT_MS: next.notifications.webhookTimeoutMs,
    MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_MAX_ATTEMPTS: next.notifications.webhookRetryMaxAttempts,
    MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_BASE_DELAY_MS: next.notifications.webhookRetryBaseDelayMs,
  });

  return getSystemSettingsSnapshot();
}

export { getSystemSettingsSnapshot, updateSystemSettings };
