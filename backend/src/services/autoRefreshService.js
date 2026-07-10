import { refreshContentType } from './ingestionService.js';

const CONTENT_TYPES = ['drama', 'novel', 'anime', 'comic'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MIN_DELAY_MS = 1_000;
const MAX_INTERVAL_MINUTES = 24 * 60;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseSortModes(value, fallback = ['hot']) {
  const normalized = String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(item => item === 'hot' || item === 'latest');
  return normalized.length > 0 ? [...new Set(normalized)] : fallback;
}

function parseAutoRefreshMode(value, fallback = 'daily') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'interval' || normalized === 'realtime') return 'interval';
  if (normalized === 'daily') return 'daily';
  return fallback;
}

function computeBackoffIntervalMinutes({
  baseIntervalMinutes,
  failureCount,
  failureBackoffEnabled,
  failureBackoffMultiplier,
  failureBackoffMaxMinutes,
}) {
  const base = parseBoundedInteger(baseIntervalMinutes, 10, 1, MAX_INTERVAL_MINUTES);
  if (!failureBackoffEnabled) return base;

  const consecutiveFailures = Math.max(0, Number(failureCount) || 0);
  if (consecutiveFailures <= 0) return base;

  const multiplier = parseBoundedInteger(failureBackoffMultiplier, 2, 2, 8);
  const maxMinutes = parseBoundedInteger(failureBackoffMaxMinutes, 60, 1, MAX_INTERVAL_MINUTES);
  const scaled = Math.round(base * (multiplier ** consecutiveFailures));
  return Math.max(base, Math.min(maxMinutes, scaled));
}

function computeNextRunAt(now, hour, minute) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function refreshAllTypes({
  types = CONTENT_TYPES,
  refreshType = refreshContentType,
  logger = console,
  backfill = {},
} = {}) {
  const results = [];

  for (const type of types) {
    const startedAt = Date.now();
    try {
      const response = await refreshType(type, backfill);
      results.push({
        type,
        status: 'success',
        count: Number(response?.count) || 0,
        durationMs: Date.now() - startedAt,
        warning: response?.warning || response?.leaderboardWarning || null,
        fallbackUsed: Boolean(response?.fallbackUsed || response?.jsonDataset?.fallbackUsed),
        jsonDataset: response?.jsonDataset || null,
        supplementalSignals: response?.supplementalSignals || { count: 0, errors: [] },
      });
    } catch (error) {
      const message = error?.message || '刷新失败';
      results.push({
        type,
        status: 'failed',
        count: 0,
        error: message,
        durationMs: Date.now() - startedAt,
      });
      logger?.error?.(`[auto-refresh] type=${type} failed: ${message}`);
    }
  }

  return results;
}

function startDailyAutoRefresh({
  enabled = parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ENABLED, true),
  runOnStartup = parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP, true),
  mode = parseAutoRefreshMode(process.env.MEDIAHUB_AUTO_REFRESH_MODE, 'daily'),
  intervalMinutes = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES, 10, 1, MAX_INTERVAL_MINUTES),
  failureBackoffEnabled = parseBoolean(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_ENABLED, true),
  failureBackoffMultiplier = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MULTIPLIER, 2, 2, 8),
  failureBackoffMaxMinutes = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MAX_MINUTES, 60, 1, MAX_INTERVAL_MINUTES),
  hour = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_HOUR, 3, 0, 23),
  minute = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_MINUTE, 0, 0, 59),
  backfillPageCount = parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 2, 1, 10),
  backfillPageSize = parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 50, 1, 50),
  backfillSortModes = parseSortModes(process.env.MEDIAHUB_INGEST_BACKFILL_SORTS, ['hot']),
  nowProvider = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
  runRefresh = refreshAllTypes,
} = {}) {
  if (!enabled) {
    logger?.info?.('[auto-refresh] disabled');
    return () => {};
  }

  const refreshMode = parseAutoRefreshMode(mode, 'daily');
  const resolvedIntervalMinutes = parseBoundedInteger(intervalMinutes, 10, 1, MAX_INTERVAL_MINUTES);

  let timerId = null;
  let stopped = false;
  let running = false;
  let consecutiveFailureRuns = 0;

  const executeRefresh = async () => {
    if (running) return;
    running = true;
    try {
      const results = await runRefresh({
        logger,
        backfill: {
          pageCount: backfillPageCount,
          pageSize: backfillPageSize,
          sortModes: backfillSortModes,
        },
      });
      const successCount = results.filter(item => item.status === 'success').length;
      const failureCount = results.length - successCount;
      consecutiveFailureRuns = failureCount > 0 ? consecutiveFailureRuns + 1 : 0;
      logger?.info?.(`[auto-refresh] run finished success=${successCount} failed=${failureCount}`);
    } catch (error) {
      consecutiveFailureRuns += 1;
      logger?.error?.(`[auto-refresh] run failed: ${error?.message || 'unknown error'}`);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    const now = nowProvider();
    const effectiveIntervalMinutes = refreshMode === 'interval'
      ? computeBackoffIntervalMinutes({
        baseIntervalMinutes: resolvedIntervalMinutes,
        failureCount: consecutiveFailureRuns,
        failureBackoffEnabled,
        failureBackoffMultiplier,
        failureBackoffMaxMinutes,
      })
      : resolvedIntervalMinutes;
    const nextRunAt = refreshMode === 'interval'
      ? new Date(now.getTime() + effectiveIntervalMinutes * MINUTE_MS)
      : computeNextRunAt(now, hour, minute);
    const delayMs = Math.max(MIN_DELAY_MS, nextRunAt.getTime() - now.getTime());

    timerId = setTimeoutFn(executeRefresh, delayMs);

    logger?.info?.(
      refreshMode === 'interval'
        ? `[auto-refresh] next interval run at ${nextRunAt.toISOString()} (every ${effectiveIntervalMinutes}m, failures=${consecutiveFailureRuns})`
        : `[auto-refresh] next daily run at ${nextRunAt.toISOString()}`
    );
  };

  if (runOnStartup) {
    Promise.resolve().then(executeRefresh);
  } else {
    scheduleNext();
  }

  return () => {
    stopped = true;
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  };
}

export {
  CONTENT_TYPES,
  DAY_MS,
  computeBackoffIntervalMinutes,
  computeNextRunAt,
  refreshAllTypes,
  startDailyAutoRefresh,
  parseAutoRefreshMode,
};
