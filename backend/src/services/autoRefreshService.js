import { refreshContentType } from './ingestionService.js';

const CONTENT_TYPES = ['drama', 'novel', 'comic', 'anime'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DELAY_MS = 1_000;

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
  hour = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_HOUR, 3, 0, 23),
  minute = parseBoundedInteger(process.env.MEDIAHUB_AUTO_REFRESH_MINUTE, 0, 0, 59),
  backfillPageCount = parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 3, 1, 10),
  backfillPageSize = parseBoundedInteger(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 30, 1, 50),
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

  let timerId = null;
  let stopped = false;
  let running = false;

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
      logger?.info?.(`[auto-refresh] run finished success=${successCount} failed=${failureCount}`);
    } catch (error) {
      logger?.error?.(`[auto-refresh] run failed: ${error?.message || 'unknown error'}`);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    const now = nowProvider();
    const nextRunAt = computeNextRunAt(now, hour, minute);
    const delayMs = Math.max(MIN_DELAY_MS, nextRunAt.getTime() - now.getTime());

    timerId = setTimeoutFn(executeRefresh, delayMs);

    logger?.info?.(`[auto-refresh] next run at ${nextRunAt.toISOString()}`);
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

export { CONTENT_TYPES, DAY_MS, computeNextRunAt, refreshAllTypes, startDailyAutoRefresh };
