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
  AdminSummary,
  AdminLogs,
  ContentQualityStats,
  PaginatedResponse,
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

    requestJson<{
      list: Content[];
      pagination: { page: number; limit: number; total: number };
    }>(
      `/contents?type=${encodeURIComponent(type)}&page=${encodeURIComponent(page)}&keyword=${encodeURIComponent(keyword)}&sort=${encodeURIComponent(sort)}`,
      { signal: controller.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS },
    )
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
