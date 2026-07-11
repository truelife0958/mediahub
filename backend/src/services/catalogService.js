import { createApiError } from '../utils/apiErrors.js';
import {
  upsertContents,
  listCachedContents,
  listCachedContentsByTopic,
  discoverCachedContents,
  getCachedContentById,
  countCachedContentsByType,
} from '../repositories/contentRepository.js';
import { listSnapshotsByContentId } from '../repositories/leaderboardRepository.js';
import { fetchPlatformHotContents } from './platformHotSourceService.js';
import {
  getHotDatasetContentById,
  listHotDatasetContents,
  listHotDatasetTopicContents,
} from './hotDatasetService.js';
import { isJsonHotDataEnabled } from '../store/jsonStore.js';
import { isCuratedRealSeedEnabled, seedCuratedRealContents } from './curatedRealContentService.js';
import { formatSearchAliasHints, resolveSearchAliasContext } from './searchAliasService.js';
import {
  resolveSourceChainByType,
  rankSourceChainByHealth,
  recordSourceOutcome,
} from './sourceStrategyService.js';
import { CONTENT_TYPES } from '../constants/contentTypes.js';

const CACHE_TTL_MS = Math.max(15_000, Number(process.env.CACHE_TTL_MS || 180_000));
const MAX_CACHE_ENTRIES = Math.max(10, Number(process.env.MEDIAHUB_CATALOG_CACHE_MAX_ENTRIES || 500));
const cacheStore = new Map();
const pendingLoads = new Map();
const MAX_QUERY_PAGE = 1000;
const MAX_KEYWORD_LENGTH = 80;
const SUPPORTED_CONTENT_SOURCES = [
  'hongguo',
  'fanqie',
  'qidian',
  'bilibili',
  'kuaikan',
  'tencent_comic',
  'manual',
  'curated-cn',
  'baidu-hot',
  'weibo-hot',
  'wechat-hot',
  'douyin-hot',
];
const JSON_FALLBACK_TYPES = new Set(['anime', 'comic']);

function isJsonDatasetExplicitlyDisabled() {
  const flag = String(process.env.MEDIAHUB_JSON_DATASET_ENABLED || '').trim().toLowerCase();
  return ['0', 'false', 'no', 'off'].includes(flag);
}

function shouldReadJsonHotDataset(type) {
  return isJsonHotDataEnabled() || (!isJsonDatasetExplicitlyDisabled() && JSON_FALLBACK_TYPES.has(type));
}

function getContentTypeFromId(contentId) {
  return String(contentId || '').split(':', 1)[0];
}
function buildCacheKey(type, params) {
  return `${type}:${JSON.stringify(params)}`;
}

function getCached(key) {
  const hit = cacheStore.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value, ttlMs = CACHE_TTL_MS) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  pruneCacheStore();
}

function pruneCacheStore() {
  const now = Date.now();
  for (const [key, hit] of cacheStore.entries()) {
    if (now > hit.expiresAt) {
      cacheStore.delete(key);
    }
  }
  while (cacheStore.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    if (!oldestKey) break;
    cacheStore.delete(oldestKey);
  }
}

// Periodic cleanup of expired cache entries (even for infrequently accessed keys)
setInterval(pruneCacheStore, 60_000).unref();

function resetCatalogRuntimeState() {
  cacheStore.clear();
  pendingLoads.clear();
}

function getCatalogCacheStats() {
  pruneCacheStore();
  return {
    size: cacheStore.size,
    maxEntries: MAX_CACHE_ENTRIES,
    ttlMs: CACHE_TTL_MS,
  };
}

function invalidateCatalogCacheByType(type) {
  for (const key of cacheStore.keys()) {
    if (!key.startsWith('list:')) continue;
    try {
      const params = JSON.parse(key.slice(5));
      if (params?.type === type) {
        cacheStore.delete(key);
      }
    } catch {
      cacheStore.delete(key);
    }
  }
}

async function getOrSetCache(key, loader, ttlMs = CACHE_TTL_MS) {
  const cached = getCached(key);
  if (cached) return cached;

  // Dedup concurrent cache misses: share the in-flight promise
  const pending = pendingLoads.get(key);
  if (pending) return pending;

  const promise = loader()
    .then((value) => {
      setCached(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      pendingLoads.delete(key);
    });

  pendingLoads.set(key, promise);
  return promise;
}

function ensureType(type) {
  if (!CONTENT_TYPES.includes(type)) {
    throw createApiError('invalid_request', 'Invalid content type');
  }
}

function normalizeSearchMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'local' ? 'local' : 'hybrid';
}

function sortContents(list, sort = 'hot') {
  const data = [...list];
  data.sort((a, b) => {
    if (sort === 'latest') return new Date(b.createdAt) - new Date(a.createdAt);
    return b.hotScore - a.hotScore;
  });
  return data;
}

function parseContentId(contentId) {
  const [type, provider, rawId] = String(contentId || '').split(':');
  if (!type || !provider || !rawId) {
    throw createApiError('invalid_request', 'Invalid content id');
  }
  if (!SUPPORTED_CONTENT_SOURCES.includes(provider)) {
    throw createApiError('invalid_request', 'Unsupported content source');
  }
  return { type, provider, rawId };
}

async function fetchBySourceToken({
  source,
  type,
  keyword,
  searchTerms,
  aliasHints,
  page,
  limit,
  sort,
  timeoutMs,
  abortSignal,
}) {
  if (source === 'platform_hot') {
    return fetchPlatformHotContents({
      type,
      page,
      limit,
      sort,
      abortSignal,
    });
  }

  return { list: [], total: 0 };
}

async function fetchListByType({
  type,
  keyword = '',
  searchTerms = [],
  aliasHints = '',
  page = 1,
  limit = 20,
  sort = 'hot',
  sourceChain,
  requestTimeoutMs,
  abortSignal,
  __skipLiveFetchForTest = false,
  __bypassCacheFallback = false,
}) {
  ensureType(type);

  const pageNum = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedKeyword = String(keyword || '').trim().slice(0, MAX_KEYWORD_LENGTH);
  const searchContext = normalizedKeyword
    ? resolveSearchAliasContext(normalizedKeyword, { type })
    : { searchTerms: [], matchedGroups: [] };
  const effectiveSearchTerms = normalizedKeyword
    ? (Array.isArray(searchTerms) && searchTerms.length > 0 ? searchTerms : searchContext.searchTerms)
    : [];
  const effectiveAliasHints = normalizedKeyword
    ? String(aliasHints || formatSearchAliasHints(searchContext)).trim()
    : '';
  const configuredSourceChain = Array.isArray(sourceChain) && sourceChain.length > 0
    ? sourceChain
    : resolveSourceChainByType(type);
  const cacheKey = buildCacheKey('list', {
    type,
    keyword: normalizedKeyword,
    searchTerms: effectiveSearchTerms,
    page: pageNum,
    limit: limitNum,
    sort,
    sourceChain: configuredSourceChain,
  });

  return getOrSetCache(cacheKey, async () => {
    if (__skipLiveFetchForTest) {
      throw createApiError('upstream_unavailable', 'Test upstream failure');
    }

    const rankedSourceChain = rankSourceChainByHealth(type, configuredSourceChain);
    let payload = { list: [], total: 0 };
    let resolvedSource = '';
    let lastError = null;
    let hasReachableSource = false;

    for (const source of rankedSourceChain) {
      const startedAt = Date.now();
      try {
        const candidate = await fetchBySourceToken({
          source,
          type,
          keyword: normalizedKeyword,
          searchTerms: effectiveSearchTerms,
          aliasHints: effectiveAliasHints,
          page: pageNum,
          limit: limitNum,
          sort,
          timeoutMs: requestTimeoutMs,
          abortSignal,
        });
        hasReachableSource = true;
        const list = Array.isArray(candidate?.list) ? candidate.list : [];
        recordSourceOutcome({
          type,
          source,
          status: list.length > 0 ? 'success' : 'empty',
          latencyMs: Date.now() - startedAt,
        });
        payload = candidate;
        if (list.length > 0) {
          resolvedSource = source;
          break;
        }
      } catch (error) {
        lastError = error;
        recordSourceOutcome({
          type,
          source,
          status: error?.publicCode === 'upstream_rate_limited' ? 'rate_limited' : 'failed',
          latencyMs: Date.now() - startedAt,
          error,
        });
        if (error?.publicCode && !String(error.publicCode).startsWith('upstream_')) {
          throw error;
        }
      }
    }

    if ((!Array.isArray(payload.list) || payload.list.length === 0) && lastError && !hasReachableSource) {
      throw lastError;
    }

    const list = sortContents(payload.list, sort);
    upsertContents(list);

    return {
      list,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(payload.total || list.length),
      },
      sourceChain: rankedSourceChain,
      resolvedSource: resolvedSource || null,
      stale: false,
    };
  });
}

async function ensureContentTypeSeeded({ type, __skipLiveFetchForTest = false }) {
  const cachedCount = countCachedContentsByType(type);
  if (cachedCount > 0) return { seeded: false, cachedCount };

  if (!__skipLiveFetchForTest && isCuratedRealSeedEnabled()) {
    const seeded = seedCuratedRealContents(type);
    if (seeded.count > 0) {
      return { seeded: true, cachedCount: countCachedContentsByType(type) };
    }
  }

  try {
    await fetchListByType({
      type,
      page: 1,
      limit: 30,
      sort: 'hot',
      __skipLiveFetchForTest,
      __bypassCacheFallback: true,
    });
  } catch (error) {
    if (__skipLiveFetchForTest || !isCuratedRealSeedEnabled()) throw error;
    seedCuratedRealContents(type);
  }
  return { seeded: true, cachedCount: countCachedContentsByType(type) };
}

async function fetchDetailById(contentId) {
  parseContentId(contentId);
  const content = getCachedContentById(contentId, { stale: false });
  if (!content) throw createApiError('not_found', 'Content detail is not cached');

  const relatedListResult = await fetchListByType({
    type: content.type,
    keyword: content.ipName || content.title,
    page: 1,
    limit: 8,
    sort: 'hot',
  }).catch(() => ({ list: [], pagination: { page: 1, limit: 8, total: 0 } }));

  const similarListResult = await fetchListByType({
    type: content.type,
    keyword: (content.tags && content.tags[0]) || content.title,
    page: 1,
    limit: 8,
    sort: 'hot',
  }).catch(() => ({ list: [], pagination: { page: 1, limit: 8, total: 0 } }));

  const relatedContents = relatedListResult.list.filter(item => item.id !== content.id).slice(0, 5);
  const similarContents = similarListResult.list.filter(item => item.id !== content.id).slice(0, 5);
  const leaderboardEvidence = listSnapshotsByContentId(content.id, { limit: 12 });

  return {
    ...content,
    leaderboardEvidence,
    relatedContents,
    similarContents,
  };
}

function parseTopicField(field) {
  const normalized = String(field || '').trim().toLowerCase();
  if (normalized === 'actor' || normalized === 'character' || normalized === 'author' || normalized === 'ip' || normalized === 'category') return normalized;
  throw createApiError('invalid_request', 'Invalid topic field');
}

function parseOptionalType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return '';
  ensureType(normalized);
  return normalized;
}

function parseMinHotScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.max(0, Math.floor(parsed));
}

async function listContents({
  type,
  page = 1,
  limit = 20,
  sort = 'hot',
  keyword = '',
  searchMode = 'hybrid',
  __skipLiveFetchForTest = false,
  __bypassCacheFallback = false,
}) {
  ensureType(type);
  const pageNum = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedKeyword = String(keyword || '').trim().slice(0, MAX_KEYWORD_LENGTH);
  const normalizedSearchMode = normalizeSearchMode(searchMode);

  if (shouldReadJsonHotDataset(type)) {
    const jsonDataset = await listHotDatasetContents({
      type,
      page: pageNum,
      limit: limitNum,
      sort,
      keyword: normalizedKeyword,
    }).catch(() => null);
    if (jsonDataset) return jsonDataset;
  }

  const searchContext = normalizedKeyword
    ? resolveSearchAliasContext(normalizedKeyword, { type })
    : { searchTerms: [], matchedGroups: [] };
  const effectiveSearchTerms = searchContext.searchTerms;
  const effectiveAliasHints = formatSearchAliasHints(searchContext);

  try {
    await ensureContentTypeSeeded({ type, __skipLiveFetchForTest });
  } catch (error) {
    if (error.publicCode && !String(error.publicCode).startsWith('upstream_')) {
      throw error;
    }
    if (__bypassCacheFallback) {
      throw createApiError('upstream_unavailable', `娑撳﹥鐖堕崘鍛啇閺堝秴濮熸稉宥呭讲閻? ${error.message}`, { error });
    }
  }

  const cached = listCachedContents({
    type,
    page,
    limit,
    sort,
    keyword,
    searchTerms: effectiveSearchTerms,
    stale: false,
  });
  if (!normalizedKeyword && cached.list.length > 0) return cached;

  if (normalizedKeyword && normalizedSearchMode === 'hybrid') {
    try {
      await fetchListByType({
        type,
        page: 1,
        limit: Math.max(30, limitNum),
        sort: 'hot',
        keyword: normalizedKeyword,
        searchTerms: effectiveSearchTerms,
        aliasHints: effectiveAliasHints,
        __skipLiveFetchForTest,
        __bypassCacheFallback: true,
      });
    } catch (error) {
      if (error?.publicCode && !String(error.publicCode).startsWith('upstream_')) {
        throw error;
      }
    }

    const merged = listCachedContents({
      type,
      page,
      limit,
      sort,
      keyword,
      searchTerms: effectiveSearchTerms,
      stale: false,
    });
    if (merged.list.length > 0) return merged;
    if (cached.list.length > 0) return cached;
  } else if (cached.list.length > 0) {
    return cached;
  }

  if (normalizedKeyword) {
    return {
      list: [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: 0,
      },
      sourceChain: [],
      resolvedSource: null,
      stale: false,
    };
  }

  if (!__bypassCacheFallback) {
    try {
      await fetchListByType({ type, page: 1, limit: 30, sort: 'hot', keyword: '', __skipLiveFetchForTest, __bypassCacheFallback: true });
      const refreshed = listCachedContents({
        type,
        page,
        limit,
        sort,
        keyword,
        stale: false,
      });
      if (refreshed.list.length > 0) return refreshed;
    } catch (error) {
      if (error.publicCode && !String(error.publicCode).startsWith('upstream_')) {
        throw error;
      }
    }
  }

  return {
    list: [],
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: 0,
    },
    sourceChain: [],
    resolvedSource: null,
    stale: false,
  };
}

async function getContentById(contentId) {
  if (shouldReadJsonHotDataset(getContentTypeFromId(contentId))) {
    const jsonContent = await getHotDatasetContentById(contentId).catch(() => null);
    if (jsonContent) return jsonContent;
  }

  const cached = getCachedContentById(contentId, { stale: false });
  if (cached) {
    return {
      ...cached,
      leaderboardEvidence: listSnapshotsByContentId(contentId, { limit: 12 }),
      relatedContents: [],
      similarContents: [],
    };
  }

  try {
    return await fetchDetailById(contentId);
  } catch (error) {
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', `閼惧嘲褰囬崘鍛啇鐠囷附鍎忔径杈Е: ${error.message}`, { error });
  }
}

async function discoverJsonHotDatasetContents({
  keyword,
  page,
  limit,
  sort,
  minHotScore,
}) {
  const normalizedMinHotScore = parseMinHotScore(minHotScore);
  const normalizedLimit = Math.min(20, Math.max(1, Number(limit) || 8));
  const groups = Object.fromEntries(CONTENT_TYPES.map(type => [type, []]));
  const counts = Object.fromEntries(CONTENT_TYPES.map(type => [type, 0]));
  let total = 0;

  await Promise.all(CONTENT_TYPES.map(async (type) => {
    const result = await listHotDatasetContents({
      type,
      page: Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1)),
      limit: normalizedLimit,
      sort,
      keyword,
    }).catch(() => null);
    const filtered = (result?.list || [])
      .filter(item => Number(item.hotScore) >= normalizedMinHotScore);
    groups[type] = filtered;
    counts[type] = filtered.length;
    total += filtered.length;
  }));

  return {
    keyword,
    sort: sort === 'latest' ? 'latest' : 'hot',
    minHotScore: normalizedMinHotScore,
    total,
    counts,
    groups,
    stale: false,
  };
}

async function discoverContents({
  keyword = '',
  page = 1,
  limit = 8,
  sort = 'hot',
  minHotScore = 0,
  searchMode = 'hybrid',
  __skipLiveFetchForTest = false,
}) {
  const normalizedKeyword = String(keyword || '').trim().slice(0, 80);
  if (!normalizedKeyword) {
    return {
      keyword: '',
      sort: sort === 'latest' ? 'latest' : 'hot',
      minHotScore: parseMinHotScore(minHotScore),
      total: 0,
      counts: Object.fromEntries(CONTENT_TYPES.map(type => [type, 0])),
      groups: Object.fromEntries(CONTENT_TYPES.map(type => [type, []])),
      stale: false,
    };
  }

  const normalizedSearchMode = normalizeSearchMode(searchMode);
  if (isJsonHotDataEnabled()) {
    return discoverJsonHotDatasetContents({
      keyword: normalizedKeyword,
      page,
      limit,
      sort,
      minHotScore,
    });
  }

  const types = CONTENT_TYPES;
  const searchTermsByType = Object.fromEntries(
    types.map(type => [type, resolveSearchAliasContext(normalizedKeyword, { type }).searchTerms]),
  );
  if (normalizedSearchMode === 'hybrid') {
    await Promise.allSettled(
      types.map(type => listContents({
        type,
        page: 1,
        limit: Math.max(30, Math.min(50, Number(limit) * 3 || 24)),
        sort,
        keyword: normalizedKeyword,
        searchMode: 'hybrid',
        __skipLiveFetchForTest,
      })),
    );
  }

  return discoverCachedContents({
    keyword: normalizedKeyword,
    page: Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1)),
    limit: Math.min(20, Math.max(1, Number(limit) || 8)),
    sort: sort === 'latest' ? 'latest' : 'hot',
    minHotScore: parseMinHotScore(minHotScore),
    searchTermsByType,
    stale: false,
  });
}

async function listTopicContents({
  field,
  value,
  type = '',
  page = 1,
  limit = 20,
  sort = 'hot',
  minHotScore = 0,
}) {
  const normalizedValue = String(value || '').trim().slice(0, MAX_KEYWORD_LENGTH);
  if (!normalizedValue) {
    throw createApiError('invalid_request', 'Topic value is required');
  }

  const normalizedField = parseTopicField(field);
  const normalizedType = parseOptionalType(type);
  const normalizedPage = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedSort = sort === 'latest' ? 'latest' : 'hot';

  if (shouldReadJsonHotDataset(normalizedType)) {
    const jsonResult = await listHotDatasetTopicContents({
      field: normalizedField,
      value: normalizedValue,
      type: normalizedType,
      page: normalizedPage,
      limit: normalizedLimit,
      sort: normalizedSort,
    }).catch(() => null);
    if (jsonResult?.list?.length > 0) return jsonResult;
  }

  return listCachedContentsByTopic({
    field: normalizedField,
    value: normalizedValue,
    type: normalizedType,
    page: normalizedPage,
    limit: normalizedLimit,
    sort: normalizedSort,
    minHotScore: parseMinHotScore(minHotScore),
    stale: false,
  });
}

export {
  listContents,
  getContentById,
  discoverContents,
  listTopicContents,
  fetchListByType,
  parseContentId,
  resetCatalogRuntimeState,
  getCatalogCacheStats,
  invalidateCatalogCacheByType,
};
