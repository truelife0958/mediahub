import { useState, useCallback, useEffect } from 'react';
import { useCategories, useContents, useCurrentUser, useGroupedDiscovery, usePublicLeaderboards, useRecommendations } from '../api';
import ContentGrid from '../components/ContentGrid';
import Header from '../components/Header';
import LeaderboardStrip from '../components/LeaderboardStrip';
import SearchBar from '../components/SearchBar';
import SectionHeader from '../components/SectionHeader';
import ApiState from '../components/ApiState';
import { CATEGORY_TEXT } from '../constants';
import type { Category, Content } from '../types';

const HOME_LEADERBOARD_REFRESH_MS = 20_000;

function CategoryTabs({
  categories,
  active,
  onChange,
}: {
  categories: Category[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`control-button relative whitespace-nowrap px-4 py-2 rounded-lg font-medium text-sm inline-flex items-center gap-1.5 cursor-pointer ${active === cat.id ? 'is-active' : ''}`}
        >
          <span className="text-base">{cat.icon}</span>
          <span>{cat.name}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [activeType, setActiveType] = useState<Content['type']>('drama');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [minHotScore, setMinHotScore] = useState(0);
  const [leaderboardLayer, setLeaderboardLayer] = useState<'overall' | 'new' | 'rising' | 'completed'>('overall');
  const [retryKey, setRetryKey] = useState(0);
  const [leaderboardRetryKey, setLeaderboardRetryKey] = useState(0);
  const [userRetryKey, setUserRetryKey] = useState(0);

  const { categories, error: categoryError } = useCategories(retryKey);
  const { user } = useCurrentUser(userRetryKey);
  const {
    contents,
    total,
    loading: contentLoading,
    error: contentError,
  } = useContents(activeType, page, keyword, sort, retryKey);
  const {
    recommendations,
    loading: recLoading,
    error: recError,
  } = useRecommendations(activeType, retryKey);
  const {
    data: groupedDiscovery,
    loading: groupedLoading,
    error: groupedError,
  } = useGroupedDiscovery(keyword, sort, minHotScore, retryKey);
  const {
    leaderboards,
    loading: leaderboardLoading,
    error: leaderboardError,
  } = usePublicLeaderboards(leaderboardRetryKey, leaderboardLayer);

  const leaderboardLayerLabel = leaderboardLayer === 'overall'
    ? '总榜'
    : leaderboardLayer === 'new'
      ? '新作榜'
      : leaderboardLayer === 'rising'
        ? '飙升榜'
        : '完结榜';

  const hasMore = contents.length < total;

  const handleTypeChange = useCallback((type: string) => {
    setActiveType(type as Content['type']);
    setPage(1);
    setKeyword('');
    setSort('hot');
    setMinHotScore(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setPage(prev => prev + 1);
  }, []);

  const handleKeywordChange = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
  }, []);

  const handleRetry = useCallback(() => {
    setPage(1);
    setRetryKey(key => key + 1);
    setUserRetryKey(key => key + 1);
  }, []);

  const isSearchMode = keyword.trim().length > 0;
  const groupedTypes = (['drama', 'novel', 'comic', 'anime'] as Content['type'][])
    .filter(type => (groupedDiscovery?.counts?.[type] || 0) > 0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setLeaderboardRetryKey(key => key + 1);
    }, HOME_LEADERBOARD_REFRESH_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />

      <Header user={user}>
        <SearchBar value={keyword} onChange={handleKeywordChange} />
      </Header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {!keyword && (
          <section className="section-shell mb-10">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeader title="实时热门榜单" subtitle={`短剧、小说、漫画、动漫四类${leaderboardLayerLabel}每 20 秒自动刷新一次`} />
              <div className="flex flex-wrap gap-2">
                {[
                  ['overall', '总榜'],
                  ['new', '新作榜'],
                  ['rising', '飙升榜'],
                  ['completed', '完结榜'],
                ].map(([layerId, label]) => (
                  <button
                    key={layerId}
                    type="button"
                    onClick={() => {
                      setLeaderboardLayer(layerId as 'overall' | 'new' | 'rising' | 'completed');
                      setLeaderboardRetryKey(key => key + 1);
                    }}
                    className={`control-button rounded-lg px-3 py-1.5 text-xs font-semibold ${leaderboardLayer === layerId ? 'is-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {leaderboardError && !leaderboardLoading ? (
              <ApiState
                title="热门榜单暂不可用"
                description={leaderboardError}
                onAction={() => setLeaderboardRetryKey(key => key + 1)}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                <LeaderboardStrip type="drama" leaderboard={leaderboards.drama} layerLabel={leaderboardLayerLabel} layerId={leaderboardLayer} />
                <LeaderboardStrip type="novel" leaderboard={leaderboards.novel} layerLabel={leaderboardLayerLabel} layerId={leaderboardLayer} />
                <LeaderboardStrip type="comic" leaderboard={leaderboards.comic} layerLabel={leaderboardLayerLabel} layerId={leaderboardLayer} />
                <LeaderboardStrip type="anime" leaderboard={leaderboards.anime} layerLabel={leaderboardLayerLabel} layerId={leaderboardLayer} />
              </div>
            )}
          </section>
        )}

        {!keyword && (
          <section className="section-shell mb-10">
            <SectionHeader title="为你推荐" subtitle="基于热度、相似 IP 与近期更新综合排序" />
            {recError ? (
              <ApiState
                title="推荐源暂不可用"
                description={recError}
                onAction={handleRetry}
              />
            ) : (
              <ContentGrid
                items={recommendations.slice(0, 5)}
                loading={recLoading}
                skeletonCount={5}
                cardSize="large"
                showReason
                emptyTitle="暂无推荐内容"
                emptyDesc="推荐数据暂未返回，换个分类或稍后重试。"
                emptyIcon="推荐"
                onRetry={handleRetry}
              />
            )}
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <SectionHeader
              title={keyword ? '搜索结果' : '热门内容'}
              subtitle={keyword ? '跨分类分组展示，本地库优先检索，并补充 AI 热门结果后入库' : '短剧/动漫按播放量，小说/漫画按阅读量排序'}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSort('hot');
                  setPage(1);
                }}
                className={`control-button px-3 py-1.5 rounded-lg text-xs cursor-pointer ${sort === 'hot' ? 'is-active' : ''}`}
              >
                热度
              </button>
              <button
                onClick={() => {
                  setSort('latest');
                  setPage(1);
                }}
                className={`control-button px-3 py-1.5 rounded-lg text-xs cursor-pointer ${sort === 'latest' ? 'is-active' : ''}`}
              >
                最新
              </button>
            </div>
          </div>

          {!isSearchMode && <CategoryTabs categories={categories} active={activeType} onChange={handleTypeChange} />}

          {(categoryError || (!isSearchMode && contentError) || (isSearchMode && groupedError)) && (
            <div className="mb-4">
              <ApiState
                title={categoryError ? '分类源暂不可用' : '内容源暂不可用'}
                description={categoryError || (isSearchMode ? groupedError : contentError) || '数据源暂不可用，请稍后重试。'}
                onAction={handleRetry}
              />
            </div>
          )}

          {keyword && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">关键词</span>
              <span className="gold-surface px-2.5 py-1 rounded-md text-xs font-semibold">{keyword}</span>
              <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                最低热度
                <select
                  value={String(minHotScore)}
                  onChange={(event) => {
                    setMinHotScore(Number(event.target.value) || 0);
                    setPage(1);
                  }}
                  className="border-0 bg-transparent text-[var(--text-primary)] outline-none"
                >
                  <option value="0">不限</option>
                  <option value="1000">1000+</option>
                  <option value="5000">5000+</option>
                  <option value="10000">10000+</option>
                </select>
              </label>
              <button
                onClick={() => {
                  setKeyword('');
                  setPage(1);
                  setMinHotScore(0);
                }}
                className="px-3 py-1.5 text-xs rounded-md bg-transparent text-[var(--text-secondary)] border-0 cursor-pointer hover:text-[var(--text-primary)]"
              >
                清空筛选
              </button>
            </div>
          )}

          {isSearchMode ? (
            <div className="space-y-8">
              {!groupedLoading && groupedDiscovery && groupedDiscovery.total > 0 && (
                <p className="text-sm text-[var(--text-muted)]">
                  共命中 {groupedDiscovery.total} 条，按短剧 / 小说 / 漫画 / 动漫分组展示。
                </p>
              )}
              {groupedTypes.length > 0 ? groupedTypes.map(type => (
                <section key={type} className="section-shell">
                  <SectionHeader
                    title={`${CATEGORY_TEXT[type]}结果`}
                    subtitle={`当前命中 ${groupedDiscovery?.counts?.[type] || 0} 条`}
                  />
                  <ContentGrid
                    items={groupedDiscovery?.groups?.[type] || []}
                    loading={groupedLoading}
                    skeletonCount={4}
                    cardSize="medium"
                    emptyTitle={`暂无${CATEGORY_TEXT[type]}结果`}
                    emptyDesc="换个关键词或稍后重试。"
                    onRetry={handleRetry}
                  />
                </section>
              )) : (
                <ContentGrid
                  items={[]}
                  loading={groupedLoading}
                  emptyTitle="没有找到相关内容"
                  emptyDesc="试试别名、演员名、作者名或 IP 名称。"
                  onRetry={handleRetry}
                />
              )}
            </div>
          ) : contentError ? null : (
            <>
              <ContentGrid
                items={contents}
                loading={contentLoading}
                page={page}
                emptyTitle="没有找到相关内容"
                emptyDesc="试试其他关键词或分类，或稍后重试。"
                onRetry={handleRetry}
              />

              {hasMore && (
                <div className="text-center mt-7">
                  <button
                    onClick={handleLoadMore}
                    disabled={contentLoading}
                    className="px-7 py-2.5 rounded-xl font-medium text-sm border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer transition-all duration-200 hover:bg-[var(--bg-card-hover)] disabled:opacity-60"
                  >
                    {contentLoading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}

              {total > 0 && (
                <p className="text-center mt-3 text-xs text-[var(--text-muted)]">
                  已显示 {contents.length} / {total} 条
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
