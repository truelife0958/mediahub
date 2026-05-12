import { useState, useEffect, useRef } from 'react';
import {
  getCategories,
  getContents,
  getContentDetail,
  getRecommendations,
  getSourceStatuses,
  refreshContentType,
} from './client';
import type { Content, Category, SourceStatus } from '../types';

export { UserProvider } from './UserContext';
export { useUser } from './userStore';
export { refreshContentType };

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getCategories(controller.signal)
      .then(data => setCategories(data))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { categories, loading, error };
}

export function useContents(type: string, page = 1, keyword = '', sort: 'hot' | 'latest' = 'hot', retryKey = 0) {
  const [contents, setContents] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevDepsRef = useRef({ type, keyword, sort });

  useEffect(() => {
    const controller = new AbortController();
    const prevDeps = prevDepsRef.current;
    const isReset = type !== prevDeps.type || keyword !== prevDeps.keyword || sort !== prevDeps.sort;
    prevDepsRef.current = { type, keyword, sort };

    setLoading(true);
    setError(null);

    getContents({ type: type as Content['type'], page, keyword, sort }, controller.signal)
      .then(res => {
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
        setStale(Boolean(res.stale));
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [type, page, keyword, sort, retryKey]);

  return { contents, total, stale, loading, error };
}

export function useContentDetail(id: string, retryKey = 0) {
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getContentDetail(id, controller.signal)
      .then(data => setContent(data))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id, retryKey]);

  return { content, loading, error };
}

export function useRecommendations(type?: string, retryKey = 0) {
  const [recommendations, setRecommendations] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getRecommendations({ type }, controller.signal)
      .then(data => setRecommendations(data))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [type, retryKey]);

  return { recommendations, loading, error };
}

export function useSourceStatus(retryKey = 0) {
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getSourceStatuses(controller.signal)
      .then(data => setStatuses(data))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [retryKey]);

  return { statuses, loading, error };
}
