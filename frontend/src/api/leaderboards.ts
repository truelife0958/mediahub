import { useEffect, useState } from 'react';
import { LONG_RUNNING_REQUEST_TIMEOUT_MS, requestJson } from './client';
import type {
  Content,
  LeaderboardAlertsResponse,
  LeaderboardDiffResponse,
  LeaderboardLayerConfig,
  LeaderboardResponse,
  LeaderboardTrendResponse,
} from '../types';

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
          // Silently skip cancelled requests (component unmount / dep change)
          if (result.reason?.name === 'AbortError') return;
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

export async function getLeaderboardLayerConfig(init?: { signal?: AbortSignal }) {
  return requestJson<LeaderboardLayerConfig>('/leaderboards/layers', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboard(params: { type: Content['type']; layer?: 'overall' | 'new' | 'rising' | 'completed' }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams({
    type: params.type,
    ...(params.layer ? { layer: params.layer } : {}),
  });
  return requestJson<LeaderboardResponse>(`/leaderboards?${query.toString()}`, { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardTrend(params: {
  type: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  contentId?: string;
  limit?: number;
}, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams({
    type: params.type,
    layer: params.layer || 'overall',
    ...(params.contentId ? { contentId: params.contentId } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
  });
  return requestJson<LeaderboardTrendResponse>(`/leaderboards/trend?${query.toString()}`, { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardDiff(params: {
  type: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  baseCaptureId?: string;
  compareCaptureId?: string;
}, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams({
    type: params.type,
    layer: params.layer || 'overall',
    ...(params.baseCaptureId ? { baseCaptureId: params.baseCaptureId } : {}),
    ...(params.compareCaptureId ? { compareCaptureId: params.compareCaptureId } : {}),
  });
  return requestJson<LeaderboardDiffResponse>(`/leaderboards/diff?${query.toString()}`, { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardAlerts(params?: {
  type?: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
  eventType?: string;
  limit?: number;
}, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.layer) query.set('layer', params.layer);
  if (params?.eventType) query.set('eventType', params.eventType);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<LeaderboardAlertsResponse>(`/leaderboards/alerts${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}
