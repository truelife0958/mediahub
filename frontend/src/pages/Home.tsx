import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getContentDetail, useContents } from '../api';
import ApiState from '../components/ApiState';
import DashboardRankTable from '../components/dashboard/DashboardRankTable';
import DashboardShell from '../components/dashboard/DashboardShell';
import InlineContentDetail from '../components/dashboard/InlineContentDetail';
import SearchBar from '../components/SearchBar';
import { CATEGORY_TEXT, VISIBLE_CONTENT_TYPES, type VisibleContentType } from '../constants';
import type { Content } from '../types';
import { hasBrokenText } from '../utils/contentMetrics';
import { buildRankDashboardSummary, buildSourceBreakdown, buildTagBreakdown, getBoardDisplayTotal, getRankSourceDisplayName } from '../utils/rankBoard';

const MODULE_TYPES: VisibleContentType[] = [...VISIBLE_CONTENT_TYPES];

const MODULE_COPY: Record<VisibleContentType, {
  title: string;
  subtitle: string;
  searchHint: string;
}> = {
  drama: {
    title: '短剧',
    subtitle: '短剧播放与平台数据榜',
    searchHint: '短剧名、主演、角色、IP',
  },
  novel: {
    title: '小说',
    subtitle: '小说阅读与 IP 数据榜',
    searchHint: '小说名、作者、角色、IP',
  },
  anime: {
    title: '动漫',
    subtitle: '动漫播放与角色数据榜',
    searchHint: '动漫名、声优、角色、IP',
  },
  comic: {
    title: '漫画',
    subtitle: '漫画阅读与条漫数据榜',
    searchHint: '漫画名、画师、角色、IP',
  },
};

function normalizeModuleType(rawType: string | undefined): VisibleContentType {
  return MODULE_TYPES.includes(rawType as VisibleContentType) ? rawType as VisibleContentType : 'drama';
}

function isDisplayableContent(content: Content) {
  const textFields = [
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
  return Boolean(String(content.title || '').trim()) && !textFields.some(hasBrokenText);
}

function formatScore(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return value.toFixed(1);
}

export default function Home() {
  const params = useParams<{ type?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isValidModulePath = !params.type || MODULE_TYPES.includes(params.type as VisibleContentType);
  const moduleType = normalizeModuleType(params.type);
  const copy = MODULE_COPY[moduleType];
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedContentOverride, setSelectedContentOverride] = useState<Content | null>(null);
  const [selectedContentDetail, setSelectedContentDetail] = useState<Content | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const querySelectedId = useMemo(
    () => new URLSearchParams(location.search).get('selected') || '',
    [location.search],
  );

  const {
    contents,
    total,
    loading: contentLoading,
    error: contentError,
  } = useContents(moduleType, page, keyword, sort, retryKey);

  useEffect(() => {
    if (!params.type) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, params.type]);

  useEffect(() => {
    setKeyword('');
    setPage(1);
    setSort('hot');
    setSelectedCategory('');
    setSelectedSource('');
    setSelectedId('');
    setSelectedContentOverride(null);
    setSelectedContentDetail(null);
  }, [moduleType]);

  useEffect(() => {
    if (querySelectedId) {
      setSelectedContentOverride(null);
      setSelectedContentDetail(null);
      setSelectedId(querySelectedId);
    }
  }, [querySelectedId]);

  const handleKeywordChange = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
    setSelectedContentOverride(null);
    setSelectedContentDetail(null);
  }, []);

  const handleRetry = useCallback(() => {
    setPage(1);
    setRetryKey(key => key + 1);
  }, []);

  const cleanContents = useMemo(() => contents.filter(isDisplayableContent), [contents]);
  const moduleCategories = useMemo(() => buildTagBreakdown(cleanContents).slice(0, 10), [cleanContents]);
  const moduleSources = useMemo(() => buildSourceBreakdown(cleanContents).slice(0, 8), [cleanContents]);
  const rankItems = useMemo(() => cleanContents.filter((item) => {
    if (selectedCategory && !(item.tags || []).includes(selectedCategory)) return false;
    if (selectedSource && getRankSourceDisplayName(item) !== selectedSource) return false;
    return true;
  }), [cleanContents, selectedCategory, selectedSource]);
  const dashboardSummary = useMemo(() => buildRankDashboardSummary(rankItems), [rankItems]);
  const selectedItem = useMemo(
    () => (
      selectedContentDetail?.id === selectedId
          ? selectedContentDetail
          : selectedContentOverride?.id === selectedId
            ? selectedContentOverride
            : rankItems.find(item => item.id === selectedId) || rankItems[0]
    ),
    [rankItems, selectedContentDetail, selectedContentOverride, selectedId],
  );
  const filteredCount = Math.max(0, contents.length - cleanContents.length);
  const hasMore = contents.length < total;
  const displayTotal = getBoardDisplayTotal({
    apiTotal: total,
    visibleCount: rankItems.length,
    selectedCategory,
    selectedSource,
  });

  useEffect(() => {
    if (selectedContentOverride?.id === selectedId) return;
    if (querySelectedId) return;
    if (!rankItems.length) {
      setSelectedId('');
      return;
    }
    if (!rankItems.some(item => item.id === selectedId)) {
      setSelectedId(rankItems[0].id);
    }
  }, [querySelectedId, rankItems, selectedContentOverride, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedContentDetail(null);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setSelectedContentDetail(null);

    getContentDetail(selectedId, { signal: controller.signal })
      .then((detail) => {
        if (!active || detail.type !== moduleType) return;
        setSelectedContentDetail(detail);
      })
      .catch((err: Error) => {
        if (!active || err.name === 'AbortError') return;
        setSelectedContentDetail(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [moduleType, selectedId]);

  if (!isValidModulePath) {
    return (
      <DashboardShell>
        <ApiState
          title="分类不存在"
          description="MediaHub 目前只保留短剧、小说、动漫、漫画四个数据入口。"
          actionLabel="返回数据看板"
          onAction={() => navigate('/dashboard', { replace: true })}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeType={moduleType}>
      <section className="module-toolbar">
        <div>
          <h1>{copy.title}数据榜</h1>
          <p>
            {copy.subtitle} · 展示 {displayTotal} 条 · 平均综合分 {formatScore(dashboardSummary.averageScore)}
            {filteredCount > 0 ? ` · 已过滤异常 ${filteredCount} 条` : ''}
            {(() => {
              const latest = contents
                .map(item => item.updatedAt || item.cachedAt || item.createdAt || '')
                .filter(Boolean)
                .sort((a, b) => b.localeCompare(a))[0];
              return latest ? ` · 榜单更新于 ${latest.slice(0, 10)}` : '';
            })()}
          </p>
        </div>
        <SearchBar value={keyword} onChange={handleKeywordChange} placeholder={copy.searchHint} variant="compact" />
        <div className="module-actions">
          <button type="button" onClick={handleRetry} disabled={contentLoading}>刷新</button>
          <button
            type="button"
            onClick={() => {
              setSort('hot');
              setPage(1);
            }}
            className={sort === 'hot' ? 'is-active' : ''}
          >
            综合
          </button>
          <button
            type="button"
            onClick={() => {
              setSort('latest');
              setPage(1);
            }}
            className={sort === 'latest' ? 'is-active' : ''}
          >
            最新
          </button>
        </div>
      </section>

      {(moduleCategories.length > 0 || moduleSources.length > 0) && (
        <section className="module-filter-dimensions" aria-label="榜单数据筛选">
          <div className="module-filter-dimension-head">
            <span>数据筛选</span>
            <strong>{selectedCategory || selectedSource ? `已筛选 ${rankItems.length} 条` : '全部数据'}</strong>
          </div>
          {moduleCategories.length > 0 && (
            <div className="module-category-strip" aria-label="按内容分类筛选">
              <span className="module-filter-axis">分类</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('');
                  setPage(1);
                  setSelectedContentOverride(null);
                  setSelectedContentDetail(null);
                }}
                className={`module-category-chip ${!selectedCategory ? 'is-active' : ''}`}
              >
                全部
              </button>
              {moduleCategories.map(item => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(item.name);
                    setPage(1);
                    setSelectedContentOverride(null);
                    setSelectedContentDetail(null);
                  }}
                  className={`module-category-chip ${selectedCategory === item.name ? 'is-active' : ''}`}
                >
                  {item.name}<span>{item.count}</span>
                </button>
              ))}
            </div>
          )}
          {moduleSources.length > 0 && (
            <div className="module-category-strip" aria-label="按真实来源筛选">
              <span className="module-filter-axis">来源</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedSource('');
                  setPage(1);
                  setSelectedContentOverride(null);
                  setSelectedContentDetail(null);
                }}
                className={`module-category-chip ${!selectedSource ? 'is-active' : ''}`}
              >
                全部
              </button>
              {moduleSources.map(item => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setSelectedSource(item.name);
                    setPage(1);
                    setSelectedContentOverride(null);
                    setSelectedContentDetail(null);
                  }}
                  className={`module-category-chip ${selectedSource === item.name ? 'is-active' : ''}`}
                >
                  {item.name}<span>{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(keyword || selectedCategory || selectedSource) && (
        <div className="module-filter-note">
          <span>{CATEGORY_TEXT[moduleType]}</span>
          <strong>{keyword || selectedCategory || selectedSource}</strong>
          <button
            type="button"
            onClick={() => {
              setKeyword('');
              setSelectedCategory('');
              setSelectedSource('');
              setPage(1);
              setSelectedContentOverride(null);
              setSelectedContentDetail(null);
            }}
          >
            清空
          </button>
        </div>
      )}

      {contentError ? (
        <ApiState
          title={`${CATEGORY_TEXT[moduleType]}内容源暂不可用`}
          description={contentError}
          actionLabel="刷新数据"
          onAction={handleRetry}
        />
      ) : (
        <section className="module-dashboard-layout">
          <div className="module-rank-pane">
            <DashboardRankTable
              title={`${CATEGORY_TEXT[moduleType]}数据榜`}
              items={rankItems}
              selectedId={selectedItem?.id}
              loading={contentLoading && page === 1}
              onSelect={item => {
                setSelectedContentOverride(null);
                setSelectedContentDetail(null);
                setSelectedId(item.id);
              }}
              onRetry={handleRetry}
              emptyTitle={`没有可展示的${CATEGORY_TEXT[moduleType]}数据`}
            />
            {hasMore && (
              <div className="module-load-more">
                <button type="button" onClick={() => setPage(prev => prev + 1)} disabled={contentLoading}>
                  {contentLoading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
          </div>
          <aside className="module-detail-pane">
            <InlineContentDetail
              content={selectedItem}
              onSelectRelated={item => {
                if (item.type !== moduleType) {
                  navigate(`/${item.type}?selected=${encodeURIComponent(item.id)}`);
                  return;
                }
                setSelectedContentOverride(item);
                setSelectedId(item.id);
              }}
            />
          </aside>
        </section>
      )}
    </DashboardShell>
  );
}
