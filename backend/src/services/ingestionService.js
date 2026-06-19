import { fetchListByType } from './catalogService.js';
import { upsertContents } from '../repositories/contentRepository.js';
import { recordSourceRun } from '../repositories/sourceRepository.js';
import { createApiError } from '../utils/apiErrors.js';
import { getIngestionCursor, saveIngestionCursor } from '../utils/ingestionCursor.js';
import { parsePositiveInt } from '../utils/retryTools.js';
import { captureLeaderboardForType } from './leaderboardService.js';

const BACKFILL_AI_TIMEOUT_MS = Math.max(5_000, Number(process.env.MEDIAHUB_BACKFILL_AI_TIMEOUT_MS || 15_000));
const BACKFILL_OVERALL_TIMEOUT_MS = Math.max(15_000, Number(process.env.MEDIAHUB_BACKFILL_OVERALL_TIMEOUT_MS || 60_000));
const BACKFILL_MAX_CONSECUTIVE_FAILURES = Math.max(1, Number(process.env.MEDIAHUB_BACKFILL_MAX_CONSECUTIVE_FAILURES || 2));

const SOURCE_BY_TYPE = {
  drama: 'ai_search',
  novel: 'ai_search',
  comic: 'ai_search',
  anime: 'ai_search',
};
const MAX_PAGE_COUNT = 10;
const MAX_PAGE_SIZE = 50;

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
  aiTimeoutMs,
  overallTimeoutMs,
  abortSignal,
} = {}) {
  const effectiveAiTimeoutMs = Math.max(5_000, Number(aiTimeoutMs) || BACKFILL_AI_TIMEOUT_MS);
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
              aiTimeoutMs: effectiveAiTimeoutMs,
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
          // — the AI provider is rejecting this type of request
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
    parsePositiveInt(process.env.MEDIAHUB_INGEST_BACKFILL_PAGES, 3, 1, MAX_PAGE_COUNT),
    1,
    MAX_PAGE_COUNT
  );
  const normalizedPageSize = parsePositiveInt(
    pageSize,
    parsePositiveInt(process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE, 30, 1, MAX_PAGE_SIZE),
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

async function refreshContentType(
  type,
  {
    loader,
    pageLoader,
    pageCount,
    pageSize,
    sortModes,
    incremental,
  } = {}
) {
  const source = sourceForType(type);
  const startedAt = new Date().toISOString();

  const normalized = normalizeBackfillOptions({ pageCount, pageSize, sortModes });
  const incrementalEnabled = readIncrementalEnabled(incremental);
  const incrementalCursor = incrementalEnabled ? getIngestionCursor({ type, source }) : null;

  try {
    const collected = await collectBackfillContents(type, {
      loader,
      pageLoader,
      pageCount: normalized.pageCount,
      pageSize: normalized.pageSize,
      sortModes: normalized.sortModes,
      incrementalCursor,
      aiTimeoutMs: BACKFILL_AI_TIMEOUT_MS,
      overallTimeoutMs: BACKFILL_OVERALL_TIMEOUT_MS,
    });
    const resolvedSource = collected.list.find(item => item?.source?.provider)?.source?.provider || source;

    const count = upsertContents(collected.list);
    const firstError = collected.failures[0]?.message;
    const partialErrorMessage = collected.failedPages > 0
      ? buildPartialErrorMessage({
        attemptedPages: collected.attemptedPages,
        failedPages: collected.failedPages,
        count,
        firstError: firstError || 'unknown error',
      })
      : null;

    if (count === 0 && collected.failedPages > 0) {
      const terminalMessage = collected.timedOut
        ? '刷新超时，AI 服务响应过慢，请稍后重试或减少回填页数。'
        : (firstError || '刷新失败');
      const firstPublicError = pickFirstPublicApiError(collected.failures);
      const effectiveCode = collected.timedOut
        ? 'upstream_timeout'
        : (firstPublicError?.publicCode || 'upstream_unavailable');
      const terminalError = firstPublicError
        ? createApiError(effectiveCode, terminalMessage, firstPublicError.details || {})
        : createApiError(effectiveCode, terminalMessage);
      recordSourceRun({
        type,
        source,
        status: 'failed',
        count: 0,
        error: terminalMessage,
        startedAt,
      });
      saveCursorStatus({
        type,
        source,
        cursorSnapshot: incrementalCursor,
        status: 'failed',
        count: 0,
        error: terminalMessage,
      });
      throw markSourceRunRecorded(terminalError);
    }

    const nextCursor = buildCursorFromList(collected.list, incrementalCursor);

    recordSourceRun({
      type,
      source: resolvedSource,
      status: 'success',
      count,
      error: partialErrorMessage,
      startedAt,
    });

    saveCursorStatus({
      type,
      source,
      cursorSnapshot: nextCursor,
      status: 'success',
      count,
      error: partialErrorMessage,
    });

    let leaderboard = null;
    let leaderboardWarning = null;
    try {
      leaderboard = await captureLeaderboardForType({
        type,
        actor: 'system',
        layers: ['overall', 'new', 'rising', 'completed'],
      });
    } catch (error) {
      leaderboardWarning = error?.message || 'leaderboard capture failed';
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
    };
  } catch (error) {
    if (!error?.sourceRunRecorded) {
      recordSourceRun({
        type,
        source,
        status: 'failed',
        count: 0,
        error: error.message || '刷新失败',
        startedAt,
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
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', error.message || '刷新失败');
  }
}

export { refreshContentType, sourceForType, dedupeById, parseSortModes, filterIncrementalByCursor, buildCursorFromList };
