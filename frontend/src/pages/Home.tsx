import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useContents, usePublicLeaderboards, useRecommendations } from '../api';
import { useSharedUser } from '../hooks/useSharedUser';
import ApiState from '../components/ApiState';
import ContentGrid from '../components/ContentGrid';
import Header from '../components/Header';
import LeaderboardStrip from '../components/LeaderboardStrip';
import SearchBar from '../components/SearchBar';
import SectionHeader from '../components/SectionHeader';
import { CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';

const MODULE_TYPES: Content['type'][] = ['drama', 'novel', 'comic', 'anime'];
const HOME_LEADERBOARD_REFRESH_MS = 20_000;

const MODULE_COPY: Record<Content['type'], {
  title: string;
  subtitle: string;
  searchHint: string;
  hotMetric: string;
  quickSearches: Array<{ label: string; value: string; kind: string }>;
}> = {
  drama: {
    title: '短剧模块',
    subtitle: '微短剧 / 竖屏短剧热度排行',
    searchHint: '短剧名、主演、角色、IP',
    hotMetric: '播放量',
    quickSearches: [
      { label: '盛夏芬德拉', value: '盛夏芬德拉', kind: 'IP' },
      { label: '刘萧旭', value: '刘萧旭', kind: '主演' },
      { label: '周晟安', value: '周晟安', kind: '角色' },
      { label: '家里家外', value: '家里家外', kind: '短剧' },
      { label: '无双', value: '无双', kind: '短剧' },
    ],
  },
  novel: {
    title: '小说模块',
    subtitle: '热门小说阅读量排行',
    searchHint: '小说名、作者、角色、IP',
    hotMetric: '阅读量',
    quickSearches: [
      { label: '斗破苍穹', value: '斗破苍穹', kind: 'IP' },
      { label: '萧炎', value: '萧炎', kind: '角色' },
      { label: '凡人修仙传', value: '凡人修仙传', kind: 'IP' },
      { label: '韩立', value: '韩立', kind: '角色' },
      { label: '天蚕土豆', value: '天蚕土豆', kind: '作者' },
    ],
  },
  comic: {
    title: '漫画模块',
    subtitle: '热门漫画阅读量排行',
    searchHint: '漫画名、作者、角色、IP',
    hotMetric: '阅读量',
    quickSearches: [
      { label: '一人之下', value: '一人之下', kind: 'IP' },
      { label: '张楚岚', value: '张楚岚', kind: '角色' },
      { label: '冯宝宝', value: '冯宝宝', kind: '角色' },
      { label: '狐妖小红娘', value: '狐妖小红娘', kind: '漫画' },
      { label: '米二', value: '米二', kind: '作者' },
    ],
  },
  anime: {
    title: '动漫模块',
    subtitle: '热门动漫播放量排行',
    searchHint: '动漫名、角色、IP',
    hotMetric: '播放量',
    quickSearches: [
      { label: '遮天', value: '遮天', kind: 'IP' },
      { label: '叶凡', value: '叶凡', kind: '角色' },
      { label: '凡人修仙传', value: '凡人修仙传', kind: 'IP' },
      { label: '韩立', value: '韩立', kind: '角色' },
      { label: '灵笼', value: '灵笼', kind: '动漫' },
    ],
  },
};

function normalizeModuleType(rawType: string | undefined): Content['type'] {
  return MODULE_TYPES.includes(rawType as Content['type']) ? rawType as Content['type'] : 'drama';
}

export default function Home() {
  const params = useParams<{ type?: string }>();
  const navigate = useNavigate();
  const isValidModulePath = !params.type || MODULE_TYPES.includes(params.type as Content['type']);
  const moduleType = normalizeModuleType(params.type);
  const copy = MODULE_COPY[moduleType];
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [leaderboardLayer, setLeaderboardLayer] = useState<'overall' | 'new' | 'rising' | 'completed'>('overall');
  const [retryKey, setRetryKey] = useState(0);
  const [leaderboardRetryKey, setLeaderboardRetryKey] = useState(0);

  const { user } = useSharedUser();
  const {
    contents,
    total,
    loading: contentLoading,
    error: contentError,
  } = useContents(moduleType, page, keyword, sort, retryKey);
  const {
    recommendations,
    loading: recLoading,
    error: recError,
  } = useRecommendations(moduleType, retryKey);
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
  const hasModuleWatchSignal = Boolean(
    user?.recentlyWatchedIds?.some(contentId => contentId.split(':')[0] === moduleType),
  );

  useEffect(() => {
    if (!params.type) {
      navigate('/drama', { replace: true });
    }
  }, [navigate, params.type]);

  useEffect(() => {
    setKeyword('');
    setPage(1);
    setSort('hot');
  }, [moduleType]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setLeaderboardRetryKey(key => key + 1);
    }, HOME_LEADERBOARD_REFRESH_MS);
    return () => window.clearInterval(timerId);
  }, []);

  const handleKeywordChange = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
  }, []);

  const handleRetry = useCallback(() => {
    setPage(1);
    setRetryKey(key => key + 1);
  }, []);

  const currentLeaderboard = useMemo(() => leaderboards[moduleType], [leaderboards, moduleType]);

  if (!isValidModulePath) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
        <div className="app-backdrop" />
        <Header user={user} />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 relative">
          <ApiState
            title="模块不存在"
            description="MediaHub 目前只有短剧、小说、漫画、动漫四个独立入口。"
            actionLabel="返回短剧"
            onAction={() => navigate('/drama', { replace: true })}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />

      <Header user={user} activeType={moduleType}>
        <SearchBar value={keyword} onChange={handleKeywordChange} placeholder={`搜索：${copy.searchHint}...`} />
      </Header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {/* 快速搜索 */}
        <section className="section-shell mb-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader title={copy.title} subtitle={copy.subtitle} />
            <div className="flex flex-wrap gap-1.5">
              {copy.quickSearches.map(item => (
                <button
                  key={`${item.kind}-${item.value}`}
                  type="button"
                  onClick={() => handleKeywordChange(item.value)}
                  className="control-button rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  title={`${item.kind}：${item.value}`}
                >
                  <span className="text-[var(--text-muted)]">{item.kind}</span>
                  <span className="ml-1">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 榜单 */}
        {!keyword && (
          <section className="section-shell mb-8">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeader title={`${CATEGORY_TEXT[moduleType]}热门榜`} subtitle={`${leaderboardLayerLabel} · 仅${CATEGORY_TEXT[moduleType]}数据`} />
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['overall', '总榜'],
                  ['new', '新作'],
                  ['rising', '飙升'],
                  ['completed', '完结'],
                ] as const).map(([layerId, label]) => (
                  <button
                    key={layerId}
                    type="button"
                    onClick={() => {
                      setLeaderboardLayer(layerId);
                      setLeaderboardRetryKey(key => key + 1);
                    }}
                    className={`control-button rounded-lg px-2.5 py-1.5 text-xs font-semibold ${leaderboardLayer === layerId ? 'is-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {leaderboardError && !leaderboardLoading ? (
              <ApiState
                title="榜单暂不可用"
                description={leaderboardError}
                onAction={() => setLeaderboardRetryKey(key => key + 1)}
              />
            ) : (
              <LeaderboardStrip type={moduleType} leaderboard={currentLeaderboard} layerLabel={leaderboardLayerLabel} layerId={leaderboardLayer} />
            )}
          </section>
        )}

        {/* 推荐 */}
        {!keyword && (
          <section className="section-shell mb-8">
            <SectionHeader title={`${CATEGORY_TEXT[moduleType]}为你推荐`} subtitle="基于已看记录和偏好推荐" />
            {!user ? (
              <div className="recommendation-hint">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">创建会话后开始推荐</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">标注已看后即可获得个性化推荐</p>
                </div>
                <button type="button" className="gold-surface rounded-lg px-4 py-2 text-xs font-semibold" onClick={() => navigate('/me')}>
                  去我的空间
                </button>
              </div>
            ) : !hasModuleWatchSignal ? (
              <div className="recommendation-hint">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">先标注已看的{CATEGORY_TEXT[moduleType]}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">标注后这里会显示个性化推荐</p>
                </div>
                <button
                  type="button"
                  className="control-button rounded-lg px-4 py-2 text-xs font-semibold"
                  onClick={() => document.getElementById('module-content-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  浏览{CATEGORY_TEXT[moduleType]}
                </button>
              </div>
            ) : recError ? (
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
                emptyTitle={`暂无${CATEGORY_TEXT[moduleType]}推荐`}
                emptyDesc="推荐数据暂未返回，稍后重试。"
                emptyIcon="推荐"
                onRetry={handleRetry}
              />
            )}
          </section>
        )}

        {/* 内容列表 */}
        <section id="module-content-list" className="section-shell">
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionHeader
              title={keyword ? `搜索：${keyword}` : `${CATEGORY_TEXT[moduleType]}内容`}
              subtitle={keyword ? `在${CATEGORY_TEXT[moduleType]}模块内检索` : `按${copy.hotMetric}排序`}
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSort('hot');
                  setPage(1);
                }}
                className={`control-button rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${sort === 'hot' ? 'is-active' : ''}`}
              >
                热度
              </button>
              <button
                onClick={() => {
                  setSort('latest');
                  setPage(1);
                }}
                className={`control-button rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${sort === 'latest' ? 'is-active' : ''}`}
              >
                最新
              </button>
            </div>
          </div>

          {keyword && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="gold-surface px-2.5 py-1 rounded-md text-xs font-semibold">{CATEGORY_TEXT[moduleType]}</span>
              <span className="text-sm text-[var(--text-secondary)]">{keyword}</span>
              <button
                onClick={() => {
                  setKeyword('');
                  setPage(1);
                }}
                className="px-2.5 py-1 text-xs rounded-md bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                清空
              </button>
            </div>
          )}

          {contentError ? (
            <ApiState
              title={`${CATEGORY_TEXT[moduleType]}内容源暂不可用`}
              description={contentError}
              onAction={handleRetry}
            />
          ) : (
            <>
              <ContentGrid
                items={contents}
                loading={contentLoading}
                page={page}
                skeletonCount={10}
                keyword={keyword}
                emptyTitle={`没有找到${CATEGORY_TEXT[moduleType]}内容`}
                emptyDesc="当前模块没有命中内容，不会显示其他模块的数据。"
                onRetry={handleRetry}
              />
              {hasMore && (
                <div className="text-center mt-7">
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={contentLoading}
                    className="control-button rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {contentLoading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
              {total > 0 && (
                <p className="text-center mt-3 text-xs text-[var(--text-muted)]">
                  {contents.length} / {total} 条
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
