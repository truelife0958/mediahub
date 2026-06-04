import { useState, useEffect, useRef } from 'react';
import type {
  Content,
  Category,
  SourceStatus,
  AiConfig,
  SystemSettings,
  SourceHealth,
  SourceRoutingSettings,
  EditableSystemSettings,
  ReferenceSettings,
  SearchAliasGroup,
  AdminSummary,
  AdminLogs,
  ContentQualityStats,
  PaginatedResponse,
  LeaderboardLayerConfig,
  LeaderboardResponse,
  LeaderboardAlertsResponse,
  LeaderboardAnomaliesResponse,
  LeaderboardDiffResponse,
  LeaderboardTrendResponse,
  KeywordSubscription,
  KeywordSubscriptionHit,
  AuditLogRecord,
  ContentRevisionRecord,
  UserProfile,
  WatchHistoryEntry,
  DiscoveryResponse,
  TopicContentsResponse,
  TopicField,
} from '../types';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  error?: string;
  message?: string;
  requestId?: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 240_000;
const LONG_RUNNING_REQUEST_TIMEOUT_MS = 240_000;

const ERROR_MESSAGE_BY_CODE: Record<number, string> = {
  1001: '请求参数无效，请检查输入后重试。',
  1002: '请求资源不存在。',
  1004: '当前会话未登录或已过期。',
  1401: '内容解析失败，请稍后重试。',
  2002: '上游内容服务暂不可用，请稍后重试。',
  2003: '上游限流中，请稍后再试。',
};

function normalizeApiErrorMessage(payload: ApiEnvelope<unknown> | null, status: number) {
  const backendMessage = String(payload?.message || '').trim();
  const fallback = ERROR_MESSAGE_BY_CODE[payload?.code || 0] || `请求失败(${status})`;
  const requestId = String(payload?.requestId || '').trim();

  if (!backendMessage) {
    return requestId ? `${fallback} [RID:${requestId}]` : fallback;
  }

  // 后端已经是业务可读消息时优先展示。
  return requestId ? `${backendMessage} [RID:${requestId}]` : backendMessage;
}

type RequestJsonInit = RequestInit & {
  timeoutMs?: number;
};

async function requestJson<T>(path: string, init?: RequestJsonInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, Number(init?.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS));
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = init?.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  const headers = new Headers(init?.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    signal: controller.signal,
    headers,
  });

  const payload: ApiEnvelope<T> | null = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(normalizeApiErrorMessage(payload, response.status));
  }
  if (!payload || payload.code !== 0) {
    throw new Error(normalizeApiErrorMessage(payload as ApiEnvelope<unknown> | null, response.status));
  }
  return payload.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时或已取消，请重试。', { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }
}

export function useCategories(retryKey = 0) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    requestJson<Category[]>('/categories', { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setCategories(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  return { categories, loading, error };
}

export function useContents(type: string, page = 1, keyword = '', sort: 'hot' | 'latest' = 'hot', retryKey = 0) {
  const [contents, setContents] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevDepsRef = useRef({ type, keyword, sort });

  useEffect(() => {
    const prevDeps = prevDepsRef.current;
    const isReset = type !== prevDeps.type || keyword !== prevDeps.keyword || sort !== prevDeps.sort;
    prevDepsRef.current = { type, keyword, sort };

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getContentPage({ type, page, keyword, sort, searchMode: 'hybrid' }, { signal: controller.signal })
      .then((res) => {
        if (!active) return;
        if (isReset || page === 1) {
          setContents(res.list);
        } else {
          setContents(prev => {
            const existingIds = new Set(prev.map(item => item.id));
            const newItems = res.list.filter(item => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        }
        setTotal(res.pagination.total);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [type, page, keyword, sort, retryKey]);

  return { contents, total, loading, error };
}

export function getContentPage(
  params: {
    type: string;
    page?: number;
    limit?: number;
    keyword?: string;
    sort?: 'hot' | 'latest';
    searchMode?: 'local' | 'hybrid';
  },
  init?: { signal?: AbortSignal },
) {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page || 1),
    limit: String(params.limit || 20),
    keyword: params.keyword || '',
    sort: params.sort || 'hot',
    searchMode: params.searchMode || 'hybrid',
  });

  return requestJson<PaginatedResponse<Content>>(
    `/contents?${query.toString()}`,
    { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS },
  );
}

export function getGroupedDiscovery(
  params: {
    keyword: string;
    page?: number;
    limit?: number;
    sort?: 'hot' | 'latest';
    minHotScore?: number;
    searchMode?: 'local' | 'hybrid';
  },
  init?: { signal?: AbortSignal },
) {
  const query = new URLSearchParams({
    keyword: params.keyword,
    page: String(params.page || 1),
    limit: String(params.limit || 8),
    sort: params.sort || 'hot',
    minHotScore: String(Math.max(0, Number(params.minHotScore) || 0)),
    searchMode: params.searchMode || 'hybrid',
  });

  return requestJson<DiscoveryResponse>(
    `/contents/discover/grouped?${query.toString()}`,
    { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS },
  );
}

export function getTopicContents(
  params: {
    field: TopicField;
    value: string;
    type?: '' | Content['type'];
    page?: number;
    limit?: number;
    sort?: 'hot' | 'latest';
    minHotScore?: number;
  },
  init?: { signal?: AbortSignal },
) {
  const query = new URLSearchParams({
    page: String(params.page || 1),
    limit: String(params.limit || 20),
    sort: params.sort || 'hot',
    minHotScore: String(Math.max(0, Number(params.minHotScore) || 0)),
  });
  if (params.type) query.set('type', params.type);

  return requestJson<TopicContentsResponse>(
    `/contents/topics/${encodeURIComponent(params.field)}/${encodeURIComponent(params.value)}?${query.toString()}`,
    { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS },
  );
}

export function useCategoryHotContents(categoryIds: string[], retryKey = 0) {
  const [contentsByCategory, setContentsByCategory] = useState<Record<string, Content[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryKey = categoryIds.join('|');

  useEffect(() => {
    const types = [...new Set(categoryKey.split('|').filter(Boolean))];
    if (types.length === 0) {
      setContentsByCategory({});
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.allSettled(
      types.map(type => getContentPage(
        { type, page: 1, limit: 10, sort: 'hot' },
        { signal: controller.signal },
      )),
    )
      .then((results) => {
        if (!active) return;
        const nextContentsByCategory: Record<string, Content[]> = {};
        const failedMessages: string[] = [];

        results.forEach((result, index) => {
          const type = types[index];
          if (result.status === 'fulfilled') {
            nextContentsByCategory[type] = result.value.list;
            return;
          }
          failedMessages.push(result.reason instanceof Error ? result.reason.message : '加载失败');
        });

        setContentsByCategory(nextContentsByCategory);
        setError(failedMessages.length > 0 ? [...new Set(failedMessages)].join('；') : null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryKey, retryKey]);

  return { contentsByCategory, loading, error };
}

export function useContentDetail(id: string, retryKey = 0) {
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setContent(null);
      setLoading(false);
      setError('内容 ID 缺失');
      return;
    }
    if (!/^[a-z]+:[a-z0-9-]+:[\w-]+$/i.test(id)) {
      setContent(null);
      setLoading(false);
      setError('内容链接无效，请返回首页重新选择内容。');
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent(null);

    requestJson<Content>(`/contents/${encodeURIComponent(id)}`, { signal: controller.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS })
      .then((data) => {
        if (!active) return;
        setContent(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, retryKey]);

  return { content, loading, error };
}

export function useGroupedDiscovery(
  keyword: string,
  sort: 'hot' | 'latest' = 'hot',
  minHotScore = 0,
  retryKey = 0,
) {
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getGroupedDiscovery({
      keyword: normalizedKeyword,
      page: 1,
      limit: 8,
      sort,
      minHotScore,
      searchMode: 'hybrid',
    }, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [keyword, sort, minHotScore, retryKey]);

  return { data, loading, error };
}

export function useCurrentUser(retryKey = 0) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    requestJson<UserProfile | null>('/users/me', { signal: controller.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS })
      .then((data) => {
        if (!active) return;
        setUser(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  return { user, loading, error };
}

export function useRecommendations(type?: string, retryKey = 0) {
  const [recommendations, setRecommendations] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({
      limit: '10',
      ...(type ? { type } : {}),
    });

    requestJson<Content[]>(`/recommendations/for-you?${query.toString()}`, { signal: controller.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS })
      .then((data) => {
        if (!active) return;
        setRecommendations(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [type, retryKey]);

  return { recommendations, loading, error };
}

export function usePublicLeaderboards(
  retryKey = 0,
  layer: 'overall' | 'new' | 'rising' | 'completed' = 'overall',
) {
  const [leaderboards, setLeaderboards] = useState<Record<Content['type'], LeaderboardResponse | null>>({
    drama: null,
    novel: null,
    comic: null,
    anime: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.allSettled(
      (['drama', 'novel', 'comic', 'anime'] as Content['type'][]).map(type => (
        requestJson<LeaderboardResponse>(`/leaderboards?${new URLSearchParams({ type, layer }).toString()}`, {
          signal: controller.signal,
          timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
        })
      )),
    )
      .then((results) => {
        if (!active) return;
        const next: Record<Content['type'], LeaderboardResponse | null> = {
          drama: null,
          novel: null,
          comic: null,
          anime: null,
        };
        const failedMessages: string[] = [];

        results.forEach((result, index) => {
          const type = (['drama', 'novel', 'comic', 'anime'] as Content['type'][])[index];
          if (result.status === 'fulfilled') {
            next[type] = result.value;
            return;
          }
          failedMessages.push(result.reason instanceof Error ? result.reason.message : '加载失败');
        });

        setLeaderboards(next);
        setError(failedMessages.length > 0 ? [...new Set(failedMessages)].join('；') : null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey, layer]);

  return { leaderboards, loading, error };
}

export async function getCurrentUser() {
  return requestJson<UserProfile | null>('/users/me', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function registerUser(username: string) {
  return requestJson<UserProfile>('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username }),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function logoutUser() {
  return requestJson<{ loggedOut: boolean }>('/users/logout', {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function addWatchHistory(contentId: string) {
  return requestJson<{ watched: boolean }>('/users/history', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function toggleFavorite(contentId: string) {
  return requestJson<{ isFavorite: boolean }>('/users/favorite', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getUserFavorites() {
  return requestJson<Content[]>('/users/favorites', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getUserHistory() {
  return requestJson<WatchHistoryEntry[]>('/users/history', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getSourceStatuses() {
  return requestJson<SourceStatus[]>('/sources/status', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminSession() {
  return requestJson<{ authenticated: boolean }>('/admin/me');
}

export async function loginAdmin(password: string) {
  return requestJson<{ authenticated: boolean }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logoutAdmin() {
  return requestJson<{ loggedOut: boolean }>('/admin/logout', {
    method: 'POST',
  });
}

export async function getSourceHealth(params?: { type?: string }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return requestJson<SourceHealth[]>(`/sources/health${suffix}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function refreshContentType(type: string) {
  return requestJson<{
    type: string;
    source: string;
    status: string;
    count: number;
    partial?: boolean;
    failedPages?: number;
    attemptedPages?: number;
    warning?: string | null;
  }>(`/ingestion/refresh?type=${encodeURIComponent(type)}`, {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAiConfig() {
  return requestJson<AiConfig>('/system/ai-config', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateAiConfig(payload: {
  enabled?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  persistTarget?: 'runtime' | 'env';
}) {
  return requestJson<AiConfig>('/system/ai-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSystemSettings() {
  return requestJson<SystemSettings>('/system/settings', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateSystemSettings(payload: EditableSystemSettings) {
  return requestJson<SystemSettings>('/system/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getReferenceSettings() {
  return requestJson<ReferenceSettings>('/system/reference-settings', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateReferenceSettings(payload: ReferenceSettings) {
  return requestJson<ReferenceSettings>('/system/reference-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSearchAliasGroups(params?: { type?: '' | Content['type']; enabled?: boolean }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.enabled !== undefined) query.set('enabled', String(params.enabled));
  return requestJson<SearchAliasGroup[]>(`/system/search-aliases${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createSearchAliasGroup(payload: {
  canonicalKeyword: string;
  aliases?: string[];
  type?: '' | Content['type'];
  enabled?: boolean;
  notes?: string;
}) {
  return requestJson<SearchAliasGroup>('/system/search-aliases', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateSearchAliasGroup(id: number, payload: Partial<{
  canonicalKeyword: string;
  aliases: string[];
  type: '' | Content['type'];
  enabled: boolean;
  notes: string;
}>) {
  return requestJson<SearchAliasGroup>(`/system/search-aliases/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function deleteSearchAliasGroup(id: number) {
  return requestJson<{ deleted: boolean; id: number }>(`/system/search-aliases/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSourceRoutingSettings() {
  return requestJson<SourceRoutingSettings>('/system/source-routing', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function upsertSourceRouting(payload: {
  type: string;
  chain: string[];
}) {
  return requestJson<{ type: string; chain: string[] }>('/system/source-routing', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function clearSourceRouting(type: string) {
  return requestJson<{ type: string; chain: string[] }>(`/system/source-routing/${encodeURIComponent(type)}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAdminSummary() {
  return requestJson<AdminSummary>('/system/admin-summary', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminContents(params: {
  type: Content['type'];
  page?: number;
  limit?: number;
  keyword?: string;
  sort?: 'hot' | 'latest';
}) {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page || 1),
    limit: String(params.limit || 12),
    sort: params.sort || 'latest',
    keyword: params.keyword || '',
  });
  return requestJson<PaginatedResponse<Content>>(`/system/admin-contents?${query.toString()}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateAdminContent(id: string, payload: Partial<Pick<
  Content,
  'title' | 'summary' | 'author' | 'ipName' | 'status' | 'hotScore' | 'tags' | 'actors'
>>) {
  return requestJson<Content>(`/system/admin-contents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createAdminContent(payload: {
  type: Content['type'];
  title: string;
  summary?: string;
  tags?: string[];
  actors?: string[];
  author?: string;
  ipName?: string;
  status?: Content['status'];
  hotScore?: number;
  sourceUrl?: string;
}) {
  return requestJson<Content>('/system/admin-contents', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function fillMissingAdminContent(id: string) {
  return requestJson<Content>(`/system/admin-contents/${encodeURIComponent(id)}/fill-missing`, {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAdminQuality() {
  return requestJson<ContentQualityStats>('/system/admin-quality', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminLogs(limit = 50) {
  return requestJson<AdminLogs>(`/system/admin-logs?limit=${encodeURIComponent(limit)}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardLayerConfig() {
  return requestJson<LeaderboardLayerConfig>('/leaderboards/layers', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboard(params: { type: Content['type']; layer?: 'overall' | 'new' | 'rising' | 'completed' }) {
  const query = new URLSearchParams({
    type: params.type,
    ...(params.layer ? { layer: params.layer } : {}),
  });
  return requestJson<LeaderboardResponse>(`/leaderboards?${query.toString()}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardTrend(params: {
  type: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  contentId?: string;
  limit?: number;
}) {
  const query = new URLSearchParams({
    type: params.type,
    layer: params.layer || 'overall',
    ...(params.contentId ? { contentId: params.contentId } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
  });
  return requestJson<LeaderboardTrendResponse>(`/leaderboards/trend?${query.toString()}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardDiff(params: {
  type: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  baseCaptureId?: string;
  compareCaptureId?: string;
}) {
  const query = new URLSearchParams({
    type: params.type,
    layer: params.layer || 'overall',
    ...(params.baseCaptureId ? { baseCaptureId: params.baseCaptureId } : {}),
    ...(params.compareCaptureId ? { compareCaptureId: params.compareCaptureId } : {}),
  });
  return requestJson<LeaderboardDiffResponse>(`/leaderboards/diff?${query.toString()}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardAlerts(params?: {
  type?: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  eventType?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.layer) query.set('layer', params.layer);
  if (params?.eventType) query.set('eventType', params.eventType);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<LeaderboardAlertsResponse>(`/leaderboards/alerts${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getLeaderboardAnomalies(params?: {
  type?: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
}) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.layer) query.set('layer', params.layer);
  return requestJson<LeaderboardAnomaliesResponse>(`/system/leaderboard-anomalies${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function triggerLeaderboardCapture() {
  return requestJson<Array<{ type: Content['type']; captures: Array<{ layer: string; captureId: string; count: number }> }>>('/system/leaderboards/capture', {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listKeywordSubscriptions(params?: { type?: Content['type']; enabled?: boolean }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.enabled !== undefined) query.set('enabled', String(params.enabled));
  return requestJson<{ list: KeywordSubscription[] }>(`/system/subscriptions${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createKeywordSubscription(payload: {
  keyword: string;
  type?: '' | Content['type'];
  channel?: string;
  target?: string;
}) {
  return requestJson<KeywordSubscription>('/system/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateKeywordSubscription(id: number, payload: Partial<{
  keyword: string;
  type: '' | Content['type'];
  channel: string;
  target: string;
  enabled: boolean;
}>) {
  return requestJson<KeywordSubscription>(`/system/subscriptions/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function deleteKeywordSubscription(id: number) {
  return requestJson<{ deleted: boolean; id: number }>(`/system/subscriptions/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listSubscriptionHits(params?: { type?: Content['type']; keyword?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.keyword) query.set('keyword', params.keyword);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<{ list: KeywordSubscriptionHit[] }>(`/system/subscription-hits${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listAuditLogs(params?: { action?: string; entityType?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.action) query.set('action', params.action);
  if (params?.entityType) query.set('entityType', params.entityType);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<{ list: AuditLogRecord[] }>(`/system/audit-logs${query.toString() ? `?${query.toString()}` : ''}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listContentRevisions(contentId: string, limit = 50) {
  return requestJson<{ list: ContentRevisionRecord[] }>(`/system/content-revisions/${encodeURIComponent(contentId)}?limit=${encodeURIComponent(String(limit))}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}
