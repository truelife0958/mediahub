import { useEffect, useState } from 'react';
import { LONG_RUNNING_REQUEST_TIMEOUT_MS, requestJson } from './client';
import type {
  Content,
  UserKeywordSubscription,
  UserPreferenceProfile,
  UserProfile,
  WatchHistoryEntry,
} from '../types';

export function useCurrentUser(retryKey = 0) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    requestJson<UserProfile | null>('/users/me', { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setUser(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        if (err.name === 'AbortError') return;
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
        if (err.name === 'AbortError') return;
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

export async function getCurrentUser() {
  return requestJson<UserProfile | null>('/users/me');
}

export async function registerUser(username: string) {
  return requestJson<UserProfile>('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function logoutUser() {
  return requestJson<{ loggedOut: boolean }>('/users/logout', {
    method: 'POST',
  });
}

export async function addWatchHistory(contentId: string) {
  return requestJson<{ watched: boolean }>('/users/history', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
  });
}

export async function toggleFavorite(contentId: string) {
  return requestJson<{ isFavorite: boolean }>('/users/favorite', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
  });
}

export async function toggleFollow(contentId: string) {
  return requestJson<{ isFollowing: boolean }>('/users/follow', {
    method: 'POST',
    body: JSON.stringify({ contentId }),
  });
}

export async function getUserFavorites(init?: { signal?: AbortSignal }) {
  return requestJson<Content[]>('/users/favorites', { signal: init?.signal });
}

export async function getUserHistory(init?: { signal?: AbortSignal }) {
  return requestJson<WatchHistoryEntry[]>('/users/history', { signal: init?.signal });
}

export async function getUserFollows(init?: { signal?: AbortSignal }) {
  return requestJson<Content[]>('/users/follows', { signal: init?.signal });
}

export async function getUserSubscriptions(init?: { signal?: AbortSignal }) {
  return requestJson<UserKeywordSubscription[]>('/users/subscriptions', { signal: init?.signal });
}

export async function createUserSubscription(payload: { keyword: string; type?: '' | Content['type'] }) {
  return requestJson<UserKeywordSubscription>('/users/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteUserSubscription(id: number) {
  return requestJson<{ deleted: boolean; id: number }>(`/users/subscriptions/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}

export async function getUserPreferenceProfile(init?: { signal?: AbortSignal }) {
  return requestJson<UserPreferenceProfile>('/users/profile', { signal: init?.signal });
}
