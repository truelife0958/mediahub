import { createApiError } from '../utils/apiErrors.js';
import {
  upsertContents,
  listCachedContents,
  getCachedContentById,
  countCachedContentsByType,
} from '../repositories/contentRepository.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { rankContentsWithAi } from './aiRankingService.js';
import { searchTrendingContentsWithAi } from './aiDiscoveryService.js';
import {
  resolveSourceChainByType,
  rankSourceChainByHealth,
  recordSourceOutcome,
} from './sourceStrategyService.js';

const CACHE_TTL_MS = Math.max(15_000, Number(process.env.CACHE_TTL_MS || 180_000));
const cacheStore = new Map();

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
}

function resetCatalogRuntimeState() {
  cacheStore.clear();
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
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}

function ensureType(type) {
  if (!['drama', 'novel', 'comic', 'anime'].includes(type)) {
    throw createApiError('invalid_request', 'Invalid content type');
  }
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
  if (provider === 'fallback' || provider !== 'ai-search') {
    throw createApiError('invalid_request', 'Unsupported content source');
  }
  return { type, provider, rawId };
}

async function fetchBySourceToken({
  source,
  type,
  keyword,
  page,
  limit,
  sort,
}) {
  if (source === 'ai_search') {
    return searchTrendingContentsWithAi({
      type,
      keyword,
      page,
      limit,
      sort,
    });
  }

  return { list: [], total: 0 };
}

async function fetchListByType({
  type,
  keyword = '',
  page = 1,
  limit = 20,
  sort = 'hot',
  sourceChain,
  __skipLiveFetchForTest = false,
  __bypassCacheFallback = false,
}) {
  ensureType(type);

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedKeyword = String(keyword || '').trim().slice(0, 80);
  const configuredSourceChain = Array.isArray(sourceChain) && sourceChain.length > 0
    ? sourceChain
    : resolveSourceChainByType(type);
  const cacheKey = buildCacheKey('list', {
    type,
    keyword: normalizedKeyword,
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
          page: pageNum,
          limit: limitNum,
          sort,
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

    const sortedList = sortContents(payload.list, sort);
    const aiConfig = getAiConfigPrivate();
    const list = await rankContentsWithAi(sortedList, aiConfig, {
      type,
      keyword: normalizedKeyword,
      page: pageNum,
      limit: limitNum,
    });
    const withSourceState = list.map(item => ({
      ...item,
      source: {
        ...(item.source || {}),
        ai: aiConfig.enabled && Boolean(aiConfig.apiKey),
        model: aiConfig.enabled && aiConfig.apiKey ? aiConfig.model : '',
      },
    }));
    upsertContents(withSourceState);

    return {
      list: withSourceState,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(payload.total || withSourceState.length),
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

  await fetchListByType({
    type,
    page: 1,
    limit: 30,
    sort: 'hot',
    __skipLiveFetchForTest,
    __bypassCacheFallback: true,
  });
  return { seeded: true, cachedCount: countCachedContentsByType(type) };
}

async function fetchDetailById(contentId) {
  parseContentId(contentId);
  const content = getCachedContentById(contentId, { stale: false });
  if (!content) throw createApiError('not_found', '内容详情尚未入库，请先通过 AI 获取/入库');

  const aiConfig = getAiConfigPrivate();
  const enrichedContent = {
    ...content,
    source: {
      ...(content.source || {}),
      ai: aiConfig.enabled && Boolean(aiConfig.apiKey),
      model: aiConfig.enabled && aiConfig.apiKey ? aiConfig.model : '',
    },
  };
  upsertContents([enrichedContent]);

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

  return {
    ...enrichedContent,
    relatedContents,
    similarContents,
  };
}

async function listContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '', __skipLiveFetchForTest = false, __bypassCacheFallback = false }) {
  ensureType(type);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedKeyword = String(keyword || '').trim();

  try {
    await ensureContentTypeSeeded({ type, __skipLiveFetchForTest });
  } catch (error) {
    if (error.publicCode && !String(error.publicCode).startsWith('upstream_')) {
      throw error;
    }
    if (__bypassCacheFallback) {
      throw createApiError('upstream_unavailable', `上游内容服务不可用: ${error.message}`, { error });
    }
  }

  const cached = listCachedContents({
    type,
    page,
    limit,
    sort,
    keyword,
    stale: false,
  });
  if (cached.list.length > 0) return cached;

  // 已有该分类缓存但本次关键词无命中：返回空列表而不是上游不可用错误。
  if (normalizedKeyword) {
    const unfilteredCache = listCachedContents({
      type,
      page: 1,
      limit: 1,
      sort: 'hot',
      keyword: '',
      stale: false,
    });
    if (unfilteredCache.pagination.total > 0) {
      return cached;
    }
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
  const cached = getCachedContentById(contentId, { stale: false });
  if (cached) {
    return { ...cached, relatedContents: [], similarContents: [] };
  }

  try {
    return await fetchDetailById(contentId);
  } catch (error) {
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', `获取内容详情失败: ${error.message}`, { error });
  }
}

export { listContents, getContentById, fetchListByType, parseContentId, resetCatalogRuntimeState, invalidateCatalogCacheByType };
