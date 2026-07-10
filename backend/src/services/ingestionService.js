import { fetchListByType } from './catalogService.js';
import { upsertContents } from '../repositories/contentRepository.js';
import { recordSourceRun } from '../repositories/sourceRepository.js';
import { createApiError } from '../utils/apiErrors.js';
import { getIngestionCursor, saveIngestionCursor } from '../utils/ingestionCursor.js';
import { parsePositiveInt } from '../utils/retryTools.js';
import { captureLeaderboardForType } from './leaderboardService.js';
import { refreshHotDataset } from './hotDatasetService.js';
import { appendCrawlLog, isJsonHotDataEnabled } from '../store/jsonStore.js';
import { fetchTargetPlatformHotItems } from './targetPlatformCrawlerService.js';
import { enrichItemsWithPublicReportFields } from './publicReportFieldCollectorService.js';
import { fetchSupplementalHotSignals, normalizeSignalLoaderResult } from './hotSignalCrawlerService.js';
import { mergeHotSignalsIntoItems } from '../store/hotSignalMerger.js';
import { recordSourceOutcome } from './sourceStrategyService.js';
import { isDatabaseDisabled } from '../db/database.js';

const BACKFILL_REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.MEDIAHUB_BACKFILL_REQUEST_TIMEOUT_MS || 15_000)
);
const BACKFILL_OVERALL_TIMEOUT_MS = Math.max(15_000, Number(process.env.MEDIAHUB_BACKFILL_OVERALL_TIMEOUT_MS || 60_000));
const BACKFILL_MAX_CONSECUTIVE_FAILURES = Math.max(1, Number(process.env.MEDIAHUB_BACKFILL_MAX_CONSECUTIVE_FAILURES || 2));

const SOURCE_BY_TYPE = {
  drama: 'platform_hot',
  novel: 'platform_hot',
  anime: 'platform_hot',
  comic: 'platform_hot',
};
const MAX_PAGE_COUNT = 10;
const MAX_PAGE_SIZE = 50;
const activeRefreshesByType = new Map();
let refreshQueue = Promise.resolve();

function sourceForType(type) {
  const source = SOURCE_BY_TYPE[type];
  if (!source) throw createApiError('invalid_request', 'Invalid content type');
  return source;
}

function parseSortModes(input, fallback = ['hot']) {
  const values = Array.isArray(input)
    ? input
    : String(input || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  const normalized = [...new Set(values)]
    .filter(item => item === 'hot' || item === 'latest');

  return normalized.length > 0 ? normalized : fallback;
}

function dedupeById(list = []) {
  const unique = [];
  const seen = new Set();

  for (const item of list) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function toErrorMessage(error) {
  return error?.message || '刷新失败';
}

function buildPartialErrorMessage({ attemptedPages, failedPages, count, firstError }) {
  return `部分分页补采失败(${failedPages}/${attemptedPages})，已入库 ${count} 条，首个错误: ${firstError}`;
}

function pickFirstPublicApiError(failures = []) {
  for (const item of failures) {
    if (item?.error?.publicCode) return item.error;
  }
  return null;
}

function markSourceRunRecorded(error) {
  if (error && typeof error === 'object') {
    error.sourceRunRecorded = true;
  }
  return error;
}

function compareTimestamp(a, b) {
  const tsA = Date.parse(String(a || ''));
  const tsB = Date.parse(String(b || ''));
  if (!Number.isFinite(tsA) || !Number.isFinite(tsB)) return 0;
  return tsA - tsB;
}

function filterIncrementalByCursor(list, cursor) {
  if (!cursor) return list;

  const cursorUpdatedAt = String(cursor.updatedAt || '').trim();
  const cursorId = String(cursor.cursor || '').trim();
  if (!cursorUpdatedAt) return list;

  return list.filter(item => {
    const itemUpdatedAt = String(item?.updatedAt || item?.createdAt || '').trim();
    if (!itemUpdatedAt) return true;

    const cmp = compareTimestamp(itemUpdatedAt, cursorUpdatedAt);
    if (cmp > 0) return true;
    if (cmp < 0) return false;

    if (!cursorId || !item?.id) return false;
    return String(item.id) !== cursorId;
  });
}

function buildCursorFromList(list, fallback) {
  if (!Array.isArray(list) || list.length === 0) {
    return {
      cursor: fallback?.cursor || '',
      updatedAt: fallback?.updatedAt || '',
    };
  }

  const sorted = [...list].sort((a, b) => {
    const cmp = compareTimestamp(b?.updatedAt || b?.createdAt, a?.updatedAt || a?.createdAt);
    if (cmp !== 0) return cmp;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
  const top = sorted[0];

  return {
    cursor: String(top?.id || fallback?.cursor || ''),
    updatedAt: String(top?.updatedAt || top?.createdAt || fallback?.updatedAt || ''),
  };
}

async function enrichWithHotSignals(list, {
  signalLoader,
  defaultSignalEnabled = true,
  type,
  now = new Date(),
} = {}) {
  if (!Array.isArray(list) || list.length === 0) {
    return {
      list: [],
      signals: [],
      errors: [],
      warning: null,
    };
  }
  if (!signalLoader && !defaultSignalEnabled) {
    return {
      list,
      signals: [],
      errors: [],
      warning: null,
    };
  }

  try {
    const result = signalLoader
      ? await signalLoader({ type, items: list, now })
      : await fetchSupplementalHotSignals({ now });
    const normalized = normalizeSignalLoaderResult(result);
    return {
      list: mergeHotSignalsIntoItems(list, normalized.signals),
      signals: normalized.signals,
      errors: normalized.errors,
      warning: normalized.errors.length > 0
        ? `部分热榜信号采集失败(${normalized.errors.length})`
        : null,
    };
  } catch (error) {
    return {
      list,
      signals: [],
      errors: [{ platform: 'supplemental_hot_signals', message: error?.message || 'fetch failed' }],
      warning: `热榜信号采集失败: ${error?.message || 'fetch failed'}`,
    };
  }
}

function readIncrementalEnabled(input) {
  if (input === undefined || input === null || input === '') {
    const envValue = String(process.env.MEDIAHUB_INGEST_INCREMENTAL_ENABLED || 'true').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(envValue);
  }

  const normalized = String(input).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function saveCursorStatus({ type, source, cursorSnapshot, status, count, error }) {
  saveIngestionCursor({
    type,
    source,
    cursor: cursorSnapshot?.cursor || '',
    updatedAt: cursorSnapshot?.updatedAt || '',
    lastStatus: status,
    lastCount: count,
    lastError: error,
  });
}

async function collectBackfillContents(type, {
  loader,
  pageLoader,
  pageCount,
  pageSize,
  sortModes,
  incrementalCursor,
  requestTimeoutMs,
  overallTimeoutMs,
  abortSignal,
} = {}) {
  const effectiveRequestTimeoutMs = Math.max(5_000, Number(requestTimeoutMs) || BACKFILL_REQUEST_TIMEOUT_MS);
  const effectiveOverallTimeoutMs = Math.max(10_000, Number(overallTimeoutMs) || BACKFILL_OVERALL_TIMEOUT_MS);

  if (loader) {
    const result = await loader();
    return {
      list: dedupeById(Array.isArray(result?.list) ? result.list : []),
      attemptedPages: 1,
      failedPages: 0,
      failures: [],
      incrementalFiltered: 0,
    };
  }

  // Combine the caller's abort signal with the overall timeout signal so that
  // either one can cancel in-flight fetch requests.
  const overallController = new AbortController();
  const overallTimer = setTimeout(() => overallController.abort(), effectiveOverallTimeoutMs);

  const onExternalAbort = () => overallController.abort();
  if (abortSignal) {
    if (abortSignal.aborted) overallController.abort();
    else abortSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const list = [];
  const failures = [];
  let attemptedPages = 0;
  let incrementalFiltered = 0;
  let consecutiveFailures = 0;
  let timedOut = false;

  try {
    for (const sort of sortModes) {
      if (overallController.signal.aborted) break;
      for (let page = 1; page <= pageCount; page += 1) {
        if (overallController.signal.aborted) break;

        attemptedPages += 1;
        let result;

        try {
          result = await (pageLoader
            ? pageLoader({ type, page, limit: pageSize, sort, incrementalCursor })
            : fetchListByType({
              type,
              page,
              limit: pageSize,
              sort,
              __bypassCacheFallback: true,
              requestTimeoutMs: effectiveRequestTimeoutMs,
              abortSignal: overallController.signal,
            }));
          consecutiveFailures = 0;
        } catch (error) {
          if (overallController.signal.aborted) {
            timedOut = true;
            break;
          }
          const isForbidden = error?.publicCode === 'upstream_forbidden';
          failures.push({
            sort,
            page,
            message: toErrorMessage(error),
            error,
          });
          consecutiveFailures += 1;

          // On 403/forbidden, stop retrying further pages of the same sort
          // because the upstream platform is rejecting this type of request.
          if (isForbidden) break;

          // Stop early after N consecutive failures to avoid long waits
          // when the upstream is consistently unavailable/timeout/rate-limited.
          if (consecutiveFailures >= BACKFILL_MAX_CONSECUTIVE_FAILURES) break;
          continue;
        }

        const pageList = Array.isArray(result?.list) ? result.list : [];
        if (pageList.length === 0) break;

        const filtered = filterIncrementalByCursor(pageList, incrementalCursor);
        incrementalFiltered += Math.max(0, pageList.length - filtered.length);
        list.push(...filtered);

        if (pageList.length < pageSize) break;
      }
      if (consecutiveFailures >= BACKFILL_MAX_CONSECUTIVE_FAILURES && !overallController.signal.aborted) break;
    }
  } catch (error) {
    // Catch AbortError from overall timeout
    if (error?.name === 'AbortError') {
      timedOut = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(overallTimer);
    if (abortSignal) abortSignal.removeEventListener('abort', onExternalAbort);
  }

  const result = {
    list: dedupeById(list),
    attemptedPages,
    failedPages: failures.length,
    failures,
    incrementalFiltered,
  };
  if (timedOut) result.timedOut = true;
  return result;
}

function normalizeBackfillOptions({ pageCount, pageSize, sortModes }) {
  const normalizedPageCount = parsePositiveInt(
    pageCount,
    parsePositiveInt(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 2, 1, MAX_PAGE_COUNT),
    1,
    MAX_PAGE_COUNT
  );
  const normalizedPageSize = parsePositiveInt(
    pageSize,
    parsePositiveInt(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 50, 1, MAX_PAGE_SIZE),
    1,
    MAX_PAGE_SIZE
  );
  const normalizedSortModes = parseSortModes(
    sortModes,
    parseSortModes(process.env.MEDIAHUB_INGEST_BACKFILL_SORTS, ['hot'])
  );

  return {
    pageCount: normalizedPageCount,
    pageSize: normalizedPageSize,
    sortModes: normalizedSortModes,
  };
}

async function executeRefreshContentType(
  type,
  {
    loader,
    targetLoader,
    signalLoader,
    publicReportLoader,
    pageLoader,
    pageCount,
    pageSize,
    sortModes,
    incremental,
  } = {}
) {
  const source = sourceForType(type);
  const startedAt = new Date().toISOString();
  const databaseDisabled = isDatabaseDisabled();

  const normalized = normalizeBackfillOptions({ pageCount, pageSize, sortModes });
  const incrementalEnabled = readIncrementalEnabled(incremental);
  const incrementalCursor = incrementalEnabled && !databaseDisabled ? getIngestionCursor({ type, source }) : null;
  const refreshStartedAt = Date.now();
  const effectiveLoader = loader || (!pageLoader
    ? (targetLoader || (() => fetchTargetPlatformHotItems({ type })))
    : undefined);

  try {
    const collected = await collectBackfillContents(type, {
      loader: effectiveLoader,
      pageLoader,
      pageCount: normalized.pageCount,
      pageSize: normalized.pageSize,
      sortModes: normalized.sortModes,
      incrementalCursor,
      requestTimeoutMs: BACKFILL_REQUEST_TIMEOUT_MS,
      overallTimeoutMs: BACKFILL_OVERALL_TIMEOUT_MS,
    });
    const publicReports = await enrichItemsWithPublicReportFields(collected.list, {
      searchPublicReports: publicReportLoader,
      now: new Date(startedAt),
    });
    const enriched = await enrichWithHotSignals(publicReports.list, {
      signalLoader,
      defaultSignalEnabled: !loader && !targetLoader && !pageLoader,
      type,
      now: new Date(startedAt),
    });
    const jsonDataset = isJsonHotDataEnabled()
      ? await refreshHotDataset(type, {
        extraItems: enriched.list,
        now: new Date(startedAt),
      })
      : null;
    const writableList = jsonDataset?.list || enriched.list;
    const resolvedSource = jsonDataset?.list?.find(item => item?.source?.provider)?.source?.provider
      || collected.list.find(item => item?.source?.provider)?.source?.provider
      || source;

    const count = databaseDisabled ? (jsonDataset?.count ?? writableList.length) : upsertContents(writableList);
    const firstError = collected.failures[0]?.message;
    const partialErrorMessage = collected.failedPages > 0
      ? buildPartialErrorMessage({
        attemptedPages: collected.attemptedPages,
        failedPages: collected.failedPages,
        count,
        firstError: firstError || 'unknown error',
      })
      : enriched.warning;

    if (count === 0 && collected.failedPages > 0) {
      const terminalMessage = collected.timedOut
        ? '刷新超时，上游平台响应过慢，请稍后重试或减少回填页数。'
        : (firstError || '刷新失败');
      const firstPublicError = pickFirstPublicApiError(collected.failures);
      const effectiveCode = collected.timedOut
        ? 'upstream_timeout'
        : (firstPublicError?.publicCode || 'upstream_unavailable');
      const terminalError = firstPublicError
        ? createApiError(effectiveCode, terminalMessage, firstPublicError.details || {})
        : createApiError(effectiveCode, terminalMessage);
      if (!databaseDisabled) {
        recordSourceRun({
          type,
          source,
          status: 'failed',
          count: 0,
          error: terminalMessage,
          startedAt,
        });
      }
      if (!databaseDisabled) {
        saveCursorStatus({
          type,
          source,
          cursorSnapshot: incrementalCursor,
          status: 'failed',
          count: 0,
          error: terminalMessage,
        });
      }
      throw markSourceRunRecorded(terminalError);
    }

    const nextCursor = buildCursorFromList(collected.list, incrementalCursor);

    if (!databaseDisabled) {
      recordSourceRun({
        type,
        source: resolvedSource,
        status: 'success',
        count,
        error: partialErrorMessage,
        startedAt,
      });
    }
    recordSourceOutcome({
      type,
      source,
      status: count > 0 ? 'success' : 'empty',
      latencyMs: Date.now() - refreshStartedAt,
    });

    if (!databaseDisabled) {
      saveCursorStatus({
        type,
        source,
        cursorSnapshot: nextCursor,
        status: 'success',
        count,
        error: partialErrorMessage,
      });
    }

    let leaderboard = null;
    let leaderboardWarning = null;
    if (!databaseDisabled) {
      try {
        leaderboard = await captureLeaderboardForType({
          type,
          actor: 'system',
          layers: ['overall', 'new', 'rising', 'completed'],
        });
      } catch (error) {
        leaderboardWarning = error?.message || 'leaderboard capture failed';
      }
    }

    if (jsonDataset) {
      await appendCrawlLog({
        type,
        source: resolvedSource,
        status: 'success',
        count,
        partial: collected.failedPages > 0,
        attemptedPages: collected.attemptedPages,
        failedPages: collected.failedPages,
        warning: partialErrorMessage,
        startedAt,
        finishedAt: new Date().toISOString(),
        jsonDataset: {
          count: jsonDataset.count,
          capturedAt: jsonDataset.dataset?.capturedAt || '',
          date: jsonDataset.dataset?.date || '',
          fallbackUsed: Boolean(jsonDataset.fallbackUsed),
        },
        items: writableList.slice(0, 20).map(item => ({
          id: item.id,
          title: item.title,
          source: item.source?.provider || item.source || '',
          hotScore: item.hotScore,
          metrics: item.metrics || {},
        })),
        supplementalSignals: {
          count: enriched.signals.length,
          errors: enriched.errors,
        },
      }, { now: new Date(startedAt) });
    }

    return {
      type,
      source: resolvedSource,
      status: 'success',
      count,
      partial: collected.failedPages > 0,
      failedPages: collected.failedPages,
      attemptedPages: collected.attemptedPages,
      warning: partialErrorMessage,
      supplementalSignals: {
        count: enriched.signals.length,
        errors: enriched.errors,
      },
      pageCount: normalized.pageCount,
      pageSize: normalized.pageSize,
      sortModes: normalized.sortModes,
      incremental: {
        enabled: incrementalEnabled,
        filteredCount: collected.incrementalFiltered,
        cursor: nextCursor.cursor,
        updatedAt: nextCursor.updatedAt,
      },
      leaderboard,
      leaderboardWarning,
      jsonDataset: jsonDataset ? {
        count: jsonDataset.count,
        capturedAt: jsonDataset.dataset?.capturedAt || '',
        date: jsonDataset.dataset?.date || '',
        fallbackUsed: Boolean(jsonDataset.fallbackUsed),
      } : null,
    };
  } catch (error) {
    if (!error?.sourceRunRecorded && !databaseDisabled) {
      recordSourceRun({
        type,
        source,
        status: 'failed',
        count: 0,
        error: error.message || '刷新失败',
        startedAt,
      });
      recordSourceOutcome({
        type,
        source,
        status: error?.publicCode === 'upstream_rate_limited' ? 'rate_limited' : 'failed',
        latencyMs: Date.now() - refreshStartedAt,
        error,
      });
      if (incrementalEnabled) {
        saveCursorStatus({
          type,
          source,
          cursorSnapshot: incrementalCursor,
          status: 'failed',
          count: 0,
          error: error.message || '刷新失败',
        });
      }
    }
    if (error.publicCode) {
      if (error.statusCode) throw error;
      throw createApiError(error.publicCode, error.message || '刷新失败', error.details || {});
    }
    throw createApiError('upstream_unavailable', error.message || '刷新失败');
  }
}


function resetIngestionRefreshQueueForTest() {
  activeRefreshesByType.clear();
  refreshQueue = Promise.resolve();
}

async function refreshContentType(type, options = {}) {
  sourceForType(type);
  const key = String(type);
  const active = activeRefreshesByType.get(key);
  if (active) return active;

  const queued = refreshQueue
    .catch(() => {})
    .then(() => executeRefreshContentType(type, options));
  const promise = queued.finally(() => {
    if (activeRefreshesByType.get(key) === promise) {
      activeRefreshesByType.delete(key);
    }
  });
  activeRefreshesByType.set(key, promise);
  refreshQueue = promise.catch(() => {});
  return promise;
}

export {
  refreshContentType,
  sourceForType,
  dedupeById,
  parseSortModes,
  filterIncrementalByCursor,
  buildCursorFromList,
  resetIngestionRefreshQueueForTest,
};
