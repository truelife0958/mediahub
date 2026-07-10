import { useEffect, useRef, useState } from 'react';
import { LONG_RUNNING_REQUEST_TIMEOUT_MS, requestJson } from './client';
import type {
  Category,
  Content,
  DiscoveryResponse,
  EntityProfileResponse,
  IpUniverseResponse,
  PaginatedResponse,
  SearchExplainResponse,
  TopicField,
} from '../types';

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
    if (isReset) {
      setContents([]);
      setTotal(0);
    }

    getContentPage({ type, page, keyword, sort, searchMode: 'local' }, { signal: controller.signal })
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

export function getContentDetail(id: string, init?: { signal?: AbortSignal }) {
  return requestJson<Content>(
    `/contents/${encodeURIComponent(id)}`,
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

export function useCategoryHotContents(categoryIds: string[], retryKey = 0, sort: 'hot' | 'latest' = 'hot') {
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
        { type, page: 1, limit: 10, sort },
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
          // Silently skip cancelled requests (component unmount / dep change)
          if (result.reason?.name === 'AbortError') return;
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
  }, [categoryKey, retryKey, sort]);

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

    getContentDetail(id, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setContent(data);
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
  }, [keyword, sort, minHotScore, retryKey]);

  return { data, loading, error };
}

export async function getIpUniverse(ipName: string) {
  return requestJson<IpUniverseResponse>(`/contents/universe/ip/${encodeURIComponent(ipName)}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getEntityProfile(field: TopicField, value: string, init?: { signal?: AbortSignal }) {
  return requestJson<EntityProfileResponse>(`/contents/entity/${encodeURIComponent(field)}/${encodeURIComponent(value)}`, { signal: init?.signal, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function explainSearchMatch(id: string, keyword: string) {
  const query = new URLSearchParams({ keyword });
  return requestJson<SearchExplainResponse>(`/contents/explain-match/${encodeURIComponent(id)}?${query.toString()}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}
