import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContentPage } from '../api';
import ApiState from '../components/ApiState';
import Header from '../components/Header';
import PlatformRankList, { type RankListItem } from '../components/PlatformRankList';
import SearchBar from '../components/SearchBar';
import SectionHeader from '../components/SectionHeader';
import { CATEGORY_TEXT, VISIBLE_CONTENT_TYPES, type VisibleContentType } from '../constants';
import type { Content } from '../types';
import { hasBrokenText } from '../utils/contentMetrics';

const MODULE_TYPES: VisibleContentType[] = [...VISIBLE_CONTENT_TYPES];

function isDisplayableContent(content: Content) {
  const fields = [
    content.title,
    content.summary,
    content.author,
    content.ipName,
    content.source?.label,
    content.source?.provider,
    ...(content.tags || []),
    ...(content.actors || []),
    ...(content.characters || []),
  ];
  return Boolean(String(content.title || '').trim()) && !fields.some(hasBrokenText);
}

function toRankItem(content: Content): RankListItem {
  const evidence = content.leaderboardEvidence?.[0];
  return {
    id: content.id,
    title: content.title,
    type: content.type,
    status: content.status,
    tags: content.tags,
    summary: content.summary,
    actors: content.actors,
    author: content.author,
    ipName: content.ipName,
    hotScore: content.hotScore,
    heatMetric: content.heatMetric,
    updatedAt: content.updatedAt,
    cachedAt: content.cachedAt,
    createdAt: content.createdAt,
    sourceProvider: content.source?.provider,
    sourceLabel: content.source?.label,
    sourceUrl: content.source?.url || evidence?.sourceUrl,
    metrics: content.metrics,
    hotSignals: content.hotSignals,
    rank: content.rank,
  };
}

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [typeFilter, setTypeFilter] = useState<'' | VisibleContentType>('');
  const [retryKey, setRetryKey] = useState(0);
  const [items, setItems] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedKeyword = keyword.trim();

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (normalizedKeyword) params.set('q', normalizedKeyword);
    else params.delete('q');
    setSearchParams(params, { replace: true });
    // Keep this tied only to the input value; searchParams is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedKeyword, setSearchParams]);

  useEffect(() => {
    if (!normalizedKeyword) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.allSettled(
      MODULE_TYPES.map(type => getContentPage({
        type,
        page: 1,
        limit: 30,
        keyword: normalizedKeyword,
        sort,
        searchMode: 'local',
      }, { signal: controller.signal })),
    )
      .then((results) => {
        if (!active) return;
        const nextItems: Content[] = [];
        const failures: string[] = [];
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            nextItems.push(...result.value.list);
            return;
          }
          if (result.reason?.name === 'AbortError') return;
          failures.push(result.reason instanceof Error ? result.reason.message : '检索失败');
        });
        setItems(nextItems.filter(isDisplayableContent));
        setError(failures.length === MODULE_TYPES.length ? [...new Set(failures)].join('；') : null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [normalizedKeyword, sort, retryKey]);

  const allItems = useMemo(() => items, [items]);

  const filteredItems = useMemo(() => (
    typeFilter ? allItems.filter(item => item.type === typeFilter) : allItems
  ), [allItems, typeFilter]);

  const rankItems = useMemo(() => filteredItems.map(toRankItem), [filteredItems]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(MODULE_TYPES.map(type => [type, 0])) as Record<VisibleContentType, number>;
    for (const item of allItems) {
      if (MODULE_TYPES.includes(item.type as VisibleContentType)) {
        next[item.type as VisibleContentType] += 1;
      }
    }
    return next;
  }, [allItems]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header>
        <SearchBar
          value={keyword}
          onChange={value => setKeyword(value)}
          placeholder="搜索标题、演员、作者、IP、分类..."
        />
      </Header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 relative">
        <section className="section-shell">
          <div className="board-toolbar">
            <div className="min-w-0">
              <SectionHeader
                title={normalizedKeyword ? `检索：${normalizedKeyword}` : '数据检索'}
                subtitle="按标题、演员、作者、IP、分类聚合 JSON 榜单数据"
              />
              <div className="board-meta-row">
                <span>结果 {rankItems.length} 条</span>
                <span>排序 {sort === 'hot' ? '热度' : '最新'}</span>
              </div>
            </div>
            <div className="board-actions">
              <button
                type="button"
                onClick={() => setRetryKey(key => key + 1)}
                disabled={!normalizedKeyword || loading}
                className="control-button rounded-lg px-2.5 py-1.5 text-xs cursor-pointer disabled:opacity-60"
              >
                刷新
              </button>
              <button
                type="button"
                onClick={() => setSort('hot')}
                className={`control-button rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${sort === 'hot' ? 'is-active' : ''}`}
              >
                热度
              </button>
              <button
                type="button"
                onClick={() => setSort('latest')}
                className={`control-button rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${sort === 'latest' ? 'is-active' : ''}`}
              >
                最新
              </button>
            </div>
          </div>

          <div className="module-category-strip">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={`module-category-chip ${!typeFilter ? 'is-active' : ''}`}
            >
              全部
              <span>{allItems.length}</span>
            </button>
            {MODULE_TYPES.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`module-category-chip ${typeFilter === type ? 'is-active' : ''}`}
              >
                {CATEGORY_TEXT[type]}
                <span>{counts[type]}</span>
              </button>
            ))}
          </div>

          {!normalizedKeyword ? (
            <ApiState
              title="输入关键词开始检索"
              description="可检索作品标题、演员、作者、IP 名称和分类标签。"
            />
          ) : error ? (
            <ApiState
              title="检索暂不可用"
              description={error}
              actionLabel="重新检索"
              onAction={() => setRetryKey(key => key + 1)}
            />
          ) : (
            <PlatformRankList
              items={rankItems}
              loading={loading}
              onItemClick={item => navigate(`/detail/${item.id}`)}
              emptyTitle="没有匹配的数据"
              emptyDesc="当前 JSON 榜单中没有命中该关键词，或异常数据已被过滤。"
              onRetry={() => setRetryKey(key => key + 1)}
            />
          )}
        </section>
      </main>
    </div>
  );
}
