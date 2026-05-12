import type {
  ApiResponse,
  PaginatedResponse,
  Content,
  Category,
  QueryParams,
  SourceStatus,
} from '../types';
import { ApiClientError } from '../types';
import { API_BASE } from '../constants';

const REQUEST_TIMEOUT_MS = 10000;

function withTimeout(signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function fetchApi<T>(url: string, options?: RequestInit, signal?: AbortSignal): Promise<T> {
  const timeout = withTimeout(signal);

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: timeout.signal,
    });

    const data: ApiResponse<T> = await response.json();
    if (!response.ok || data.code !== 0) {
      throw new ApiClientError(data.message || 'API Error', response.status, data.code, data.error);
    }

    return data.data as T;
  } finally {
    timeout.clear();
  }
}

export function getCategories(signal?: AbortSignal) {
  return fetchApi<Category[]>('/categories', {}, signal);
}

export function getContents(params: QueryParams, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    type: params.type,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
    sort: params.sort ?? 'hot',
  });

  if (params.keyword) {
    searchParams.set('keyword', params.keyword);
  }

  return fetchApi<PaginatedResponse<Content>>(`/contents?${searchParams.toString()}`, {}, signal);
}

export function getContentDetail(id: string, signal?: AbortSignal) {
  return fetchApi<Content>(`/contents/${encodeURIComponent(id)}`, {}, signal);
}

export function getRecommendations(params: { type?: string; limit?: number }, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({ limit: String(params.limit ?? 10) });
  if (params.type) {
    searchParams.set('type', params.type);
  }
  return fetchApi<Content[]>(`/recommendations/for-you?${searchParams.toString()}`, {}, signal);
}

export function getCurrentUser(signal?: AbortSignal) {
  return fetchApi<{ id: string; username: string } | null>('/users/me', {}, signal);
}

export function getWatchHistory(signal?: AbortSignal) {
  return fetchApi<{ content: Content; watchedAt: string }[]>('/users/history', {}, signal);
}

export function registerUser(username: string) {
  return fetchApi<{ id: string; username: string }>('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export function logoutUser() {
  return fetchApi<{ loggedOut: boolean }>('/users/logout', {
    method: 'POST',
  });
}

export function markWatched(contentId: string) {
  return fetchApi<{ watched: boolean }>('/users/history', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
  });
}

export function toggleFavorite(contentId: string) {
  return fetchApi<{ isFavorite: boolean }>('/users/favorite', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
  });
}

export function getFavorites(signal?: AbortSignal) {
  return fetchApi<Content[]>('/users/favorites', {}, signal);
}

export function getSourceStatuses(signal?: AbortSignal) {
  return fetchApi<SourceStatus[]>('/sources/status', {}, signal);
}

export function refreshContentType(type: string) {
  return fetchApi<{ type: string; source: string; status: string; count: number }>(
    `/ingestion/refresh?type=${encodeURIComponent(type)}`,
    { method: 'POST' },
  );
}
