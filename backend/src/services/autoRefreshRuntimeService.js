import { CONTENT_TYPES, refreshAllTypes, startDailyAutoRefresh } from './autoRefreshService.js';
import { getSystemSettingsSnapshot } from './systemSettingsService.js';

let started = false;
let stopCurrentScheduler = null;
let currentSettings = null;
let timerId = null;
let nextRunAt = null;
let running = false;
let activeRunPromise = null;
let lastRunAt = null;
let lastFinishedAt = null;
let lastTrigger = '';
let lastResults = [];
let lastError = null;
let updatedAt = null;

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function buildBackfillOptions(settings = getSystemSettingsSnapshot()) {
  return {
    pageCount: settings.ingestBackfill.pages,
    pageSize: settings.ingestBackfill.pageSize,
    sortModes: settings.ingestBackfill.sorts,
  };
}

function createStatus(settings = currentSettings || getSystemSettingsSnapshot()) {
  const autoRefresh = settings.autoRefresh;
  return {
    started,
    enabled: Boolean(autoRefresh.enabled),
    mode: autoRefresh.mode,
    intervalMinutes: autoRefresh.intervalMinutes,
    hour: autoRefresh.hour,
    minute: autoRefresh.minute,
    runOnStartup: autoRefresh.runOnStartup,
    scheduled: Boolean(timerId && nextRunAt),
    running,
    nextRunAt: toIso(nextRunAt),
    lastRunAt: toIso(lastRunAt),
    lastFinishedAt: toIso(lastFinishedAt),
    lastTrigger,
    lastError,
    lastResults,
    updatedAt: toIso(updatedAt),
    backfill: buildBackfillOptions(settings),
  };
}

async function executeTrackedRefresh({
  trigger = 'manual',
  logger = console,
  runRefresh = refreshAllTypes,
  types = CONTENT_TYPES,
  backfill = buildBackfillOptions(),
} = {}) {
  if (activeRunPromise) return activeRunPromise;

  lastRunAt = new Date();
  lastTrigger = trigger;
  lastError = null;
  running = true;

  activeRunPromise = runRefresh({
    types,
    logger,
    backfill,
  })
    .then((results) => {
      lastResults = Array.isArray(results) ? results : [];
      lastFinishedAt = new Date();
      updatedAt = lastFinishedAt;
      return lastResults;
    })
    .catch((error) => {
      lastError = error?.message || '自动更新失败';
      lastFinishedAt = new Date();
      updatedAt = lastFinishedAt;
      throw error;
    })
    .finally(() => {
      running = false;
      activeRunPromise = null;
    });

  return activeRunPromise;
}

function stopAutoRefreshRuntime() {
  if (stopCurrentScheduler) {
    stopCurrentScheduler();
    stopCurrentScheduler = null;
  }
  timerId = null;
  nextRunAt = null;
  updatedAt = new Date();
}

function restartAutoRefreshRuntime({
  logger = console,
  nowProvider = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  runRefresh = refreshAllTypes,
} = {}) {
  currentSettings = getSystemSettingsSnapshot();
  stopAutoRefreshRuntime();

  if (!started) {
    updatedAt = new Date();
    return createStatus(currentSettings);
  }

  const { autoRefresh } = currentSettings;
  const backfill = buildBackfillOptions(currentSettings);

  const trackTimeout = (fn, delay) => {
    const scheduledAt = nowProvider();
    nextRunAt = new Date(scheduledAt.getTime() + Math.max(0, Number(delay) || 0));
    const id = setTimeoutFn(() => {
      if (timerId === id) {
        timerId = null;
        nextRunAt = null;
      }
      fn();
    }, delay);
    timerId = id;
    updatedAt = new Date();
    return id;
  };

  const clearTrackedTimeout = (id) => {
    clearTimeoutFn(id);
    if (timerId === id) {
      timerId = null;
      nextRunAt = null;
    }
  };

  stopCurrentScheduler = startDailyAutoRefresh({
    ...autoRefresh,
    backfillPageCount: backfill.pageCount,
    backfillPageSize: backfill.pageSize,
    backfillSortModes: backfill.sortModes,
    nowProvider,
    setTimeoutFn: trackTimeout,
    clearTimeoutFn: clearTrackedTimeout,
    logger,
    runRefresh: ({ backfill: scheduledBackfill } = {}) => executeTrackedRefresh({
      trigger: 'auto',
      logger,
      runRefresh,
      backfill: scheduledBackfill || backfill,
    }),
  });

  updatedAt = new Date();
  return createStatus(currentSettings);
}

function startAutoRefreshRuntime(options = {}) {
  started = true;
  return restartAutoRefreshRuntime(options);
}

async function refreshAllContentTypesNow(options = {}) {
  const settings = getSystemSettingsSnapshot();
  currentSettings = settings;
  const results = await executeTrackedRefresh({
    trigger: options.trigger || 'manual',
    logger: options.logger || console,
    runRefresh: options.runRefresh || refreshAllTypes,
    types: options.types || CONTENT_TYPES,
    backfill: options.backfill || buildBackfillOptions(settings),
  });
  return {
    results,
    status: createStatus(settings),
  };
}

function getAutoRefreshRuntimeStatus() {
  return createStatus();
}

function resetAutoRefreshRuntimeForTest() {
  stopAutoRefreshRuntime();
  started = false;
  currentSettings = null;
  running = false;
  activeRunPromise = null;
  lastRunAt = null;
  lastFinishedAt = null;
  lastTrigger = '';
  lastResults = [];
  lastError = null;
  updatedAt = null;
}

export {
  buildBackfillOptions,
  executeTrackedRefresh,
  getAutoRefreshRuntimeStatus,
  refreshAllContentTypesNow,
  resetAutoRefreshRuntimeForTest,
  restartAutoRefreshRuntime,
  startAutoRefreshRuntime,
  stopAutoRefreshRuntime,
};
