import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  addWatchHistory,
  createUserSubscription,
  getLeaderboardTrend,
  getUserFavorites,
  toggleFavorite,
  toggleFollow,
  useContentDetail,
} from '../api';
import { useSharedUser } from '../hooks/useSharedUser';
import RelatedCard from '../components/RelatedCard';
import ApiState from '../components/ApiState';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { CATEGORY_COLORS, CATEGORY_TEXT, CATEGORY_ICONS } from '../constants';
import { IconBack, IconHeart, IconHistory } from '../components/Icons';
import { formatHotScore } from '../utils/hotScore';
import type { LeaderboardTrendResponse } from '../types';

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [retryKey, setRetryKey] = useState(0);
  const { user } = useSharedUser();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [watched, setWatched] = useState(false);
  const [actionBusy, setActionBusy] = useState<'favorite' | 'history' | 'follow' | 'subscribe' | ''>('');
  const [trend, setTrend] = useState<LeaderboardTrendResponse | null>(null);
  const [compareCount, setCompareCount] = useState(0);
  const { toast, showToast } = useToast();
  const contentId = id || '';
  const invalidContentId = contentId.length > 200 || !/^[a-z]+:[a-z0-9-]+:[\w.-]+$/i.test(contentId);
  const { content, loading, error } = useContentDetail(contentId, retryKey);

  const handleGoBack = useCallback(() => navigate(-1), [navigate]);
  const buildTopicPath = useCallback((field: 'actor' | 'character' | 'author' | 'ip', value: string) => (
    `/topics/${field}/${encodeURIComponent(value)}?type=${encodeURIComponent(content?.type || '')}`
  ), [content?.type]);

  useEffect(() => {
    if (!contentId) return;
    const controller = new AbortController();

    if (user) {
      getUserFavorites({ signal: controller.signal })
        .then((items) => {
          setIsFavorite(items.some(item => item.id === contentId));
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setIsFavorite(false);
        });
    } else {
      setIsFavorite(false);
    }
    setWatched(Boolean(user && contentId && user.recentlyWatchedIds?.includes(contentId)));
    setIsFollowing(Boolean(user && contentId && user.followingIds?.includes(contentId)));

    return () => { controller.abort(); };
  }, [contentId, user]);

  const evidenceList = useMemo(() => content?.leaderboardEvidence || [], [content?.leaderboardEvidence]);
  const trendItems = useMemo(() => (trend?.timeline || []).slice(-8), [trend?.timeline]);

  useEffect(() => {
    if (!content) return;
    const controller = new AbortController();
    getLeaderboardTrend({ type: content.type, layer: 'overall', contentId: content.id, limit: 12 }, { signal: controller.signal })
      .then(setTrend)
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setTrend(null);
      });
    return () => { controller.abort(); };
  }, [content?.id, content?.type]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('mediahub_compare_ids') || '[]';
      const ids = JSON.parse(raw);
      setCompareCount(Array.isArray(ids) ? ids.length : 0);
    } catch {
      setCompareCount(0);
    }
  }, [contentId]);

  const handleToggleFavorite = useCallback(async () => {
    if (!contentId) return;
    if (!user) {
      navigate('/me');
      return;
    }
    setActionBusy('favorite');
    try {
      const result = await toggleFavorite(contentId);
      setIsFavorite(result.isFavorite);
      showToast(result.isFavorite ? '已加入收藏' : '已取消收藏', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setActionBusy('');
    }
  }, [contentId, navigate, user, showToast]);

  const handleMarkWatched = useCallback(async () => {
    if (!contentId || watched) return;
    if (!user) {
      navigate('/me');
      return;
    }
    setActionBusy('history');
    try {
      await addWatchHistory(contentId);
      setWatched(true);
      showToast('已标注为已看', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setActionBusy('');
    }
  }, [contentId, navigate, user, watched, showToast]);

  const handleToggleFollow = useCallback(async () => {
    if (!contentId) return;
    if (!user) {
      navigate('/me');
      return;
    }
    setActionBusy('follow');
    try {
      const result = await toggleFollow(contentId);
      setIsFollowing(result.isFollowing);
      showToast(result.isFollowing ? '已加入追更' : '已取消追更', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setActionBusy('');
    }
  }, [contentId, navigate, user, showToast]);

  const handleSubscribeIp = useCallback(async () => {
    if (!content?.ipName) return;
    if (!user) {
      navigate('/me');
      return;
    }
    setActionBusy('subscribe');
    try {
      const result = await createUserSubscription({ keyword: content.ipName, type: content.type });
      showToast(result.alreadyExists ? `已订阅关键词：${content.ipName}` : `已订阅关键词：${content.ipName}`, result.alreadyExists ? 'info' : 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setActionBusy('');
    }
  }, [content, navigate, user, showToast]);

  const handleAddCompare = useCallback(() => {
    if (!contentId) return;
    let ids: string[];
    try {
      const raw = window.localStorage.getItem('mediahub_compare_ids') || '[]';
      const parsed = JSON.parse(raw);
      ids = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      ids = [];
    }
    if (ids.includes(contentId)) {
      showToast('已在对比列表中', 'info');
      return;
    }
    const next = [contentId, ...ids].slice(0, 4);
    try {
      window.localStorage.setItem('mediahub_compare_ids', JSON.stringify(next));
      setCompareCount(next.length);
      showToast(`已加入对比（${next.length}/4）`, 'success');
    } catch {
      showToast('存储空间不足', 'error');
    }
  }, [contentId, showToast]);

  const layerLabel = (layer: string) =>
    layer === 'overall' ? '总榜' : layer === 'new' ? '新作榜' : layer === 'rising' ? '飙升榜' : '完结榜';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="gold-surface w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center animate-float">
            <span className="text-sm font-black">MH</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] px-4">
        <ApiState
          title="详情源暂不可用"
          description={error || '内容不存在'}
          actionLabel={invalidContentId ? '返回首页' : '重新加载'}
          onAction={() => {
            if (invalidContentId) {
              navigate('/');
              return;
            }
            setRetryKey(key => key + 1);
          }}
        />
        <button
          onClick={handleGoBack}
          className="gold-surface inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-0 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_rgba(232,168,56,0.5)]"
        >
          返回上一页
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoBack}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              aria-label="返回"
            >
              <IconBack size={16} />
            </button>
            <h1 className="font-semibold text-base truncate flex-1">{content.title}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {/* 主信息卡 */}
        <div className="rounded-2xl p-4 md:p-6 mb-6 animate-fade-in bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 flex-col">
            {/* 分类标签 + 状态 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md tracking-[0.02em] text-white" style={{ background: CATEGORY_COLORS[content.type] }}>
                {CATEGORY_ICONS[content.type]} {CATEGORY_TEXT[content.type]}
              </span>
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${content.status === 'ongoing' ? 'bg-[rgba(34,197,94,0.12)] text-[#4ade80] border border-[rgba(34,197,94,0.2)]' : 'bg-[rgba(161,161,170,0.12)] text-[var(--text-muted)] border border-[rgba(161,161,170,0.15)]'}`}>
                {content.status === 'ongoing' ? '连载中' : '已完结'}
              </span>
              <span className="detail-hot-score ml-auto">{formatHotScore(content.hotScore, content.heatMetric)}</span>
            </div>

            {/* 标题 */}
            <h2 className="text-2xl md:text-[28px] font-bold -tracking-[0.02em] leading-tight mb-4">{content.title}</h2>

            {/* 元信息 */}
            <div className="flex flex-col gap-2.5 mb-4 text-sm">
              {content.actors && content.actors.length > 0 && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">主演</span>
                  <div className="min-w-0 flex flex-wrap gap-x-1 gap-y-0.5">
                    {content.actors.map((actor, index) => (
                      <span key={actor}>
                        <button
                          type="button"
                          onClick={() => navigate(buildTopicPath('actor', actor))}
                          className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                        >
                          {actor}
                        </button>
                        {index < content.actors.length - 1 ? <span className="text-[var(--text-muted)]"> / </span> : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {content.characters && content.characters.length > 0 && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">角色</span>
                  <div className="min-w-0 flex flex-wrap gap-x-1 gap-y-0.5">
                    {content.characters.map((character, index) => (
                      <span key={character}>
                        <button
                          type="button"
                          onClick={() => navigate(buildTopicPath('character', character))}
                          className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                        >
                          {character}
                        </button>
                        {index < (content.characters?.length || 0) - 1 ? <span className="text-[var(--text-muted)]"> / </span> : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {content.author && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">作者</span>
                  <button
                    type="button"
                    onClick={() => navigate(buildTopicPath('author', content.author))}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {content.author}
                  </button>
                </div>
              )}
              {content.ipName && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">IP</span>
                  <button
                    type="button"
                    onClick={() => navigate(buildTopicPath('ip', content.ipName))}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {content.ipName}
                  </button>
                </div>
              )}
            </div>

            {/* 标签 */}
            {content.tags && content.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {content.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.06)] transition-colors duration-200 hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]">#{tag}</span>
                ))}
              </div>
            )}

            {/* 简介 */}
            {content.summary && (
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-5 break-words">{content.summary}</p>
            )}

            {/* 主操作区 */}
            <div className="flex flex-wrap items-center gap-2.5 mb-3">
              <button
                type="button"
                onClick={handleMarkWatched}
                className={`detail-action-primary ${watched ? 'watched' : ''}`}
                disabled={watched || actionBusy === 'history'}
              >
                <IconHistory size={15} />
                {watched ? '已看' : user ? '标注已看' : '创建会话后标注'}
              </button>
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={actionBusy === 'favorite'}
                className={`detail-action-secondary ${isFavorite ? 'favorite' : ''}`}
              >
                <IconHeart size={15} filled={isFavorite} />
                {isFavorite ? '已收藏' : '加入收藏'}
              </button>
              <button
                type="button"
                onClick={handleToggleFollow}
                disabled={actionBusy === 'follow'}
                className={`detail-action-secondary ${isFollowing ? 'favorite' : ''}`}
              >
                {isFollowing ? '追更中' : '加入追更'}
              </button>
            </div>

            {/* 辅助操作区 */}
            <div className="flex flex-wrap items-center gap-2">
              {content.ipName && (
                <button type="button" onClick={handleSubscribeIp} disabled={actionBusy === 'subscribe'} className="detail-action-secondary text-xs px-3 py-2">
                  订阅IP
                </button>
              )}
              <button type="button" onClick={handleAddCompare} className="detail-action-secondary text-xs px-3 py-2">
                加入对比 {compareCount > 0 ? `(${compareCount})` : ''}
              </button>
              {compareCount > 0 && (
                <button type="button" onClick={() => navigate('/compare')} className="detail-action-secondary text-xs px-3 py-2">
                  内容对比
                </button>
              )}
            </div>

            {/* 数据来源 */}
            {content.source && (
              <div className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
                数据来源：{content.source.url ? (
                  <a href={content.source.url} target="_blank" rel="noreferrer" className="text-[var(--accent-primary)] hover:underline">
                    {content.source.label}
                  </a>
                ) : content.source.label}
                <span className="mx-2">·</span>
                更新于 {new Date(content.updatedAt).toLocaleDateString('zh-CN')}
              </div>
            )}
          </div>
        </div>

        {/* 热度证据 */}
        <section className="mb-6 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold">热度证据</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[11px] text-[var(--text-muted)]">口径</p>
                <p className="mt-1 text-sm font-semibold">{content.heatMetric === 'reading' ? '阅读量' : '播放量'}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[11px] text-[var(--text-muted)]">热度</p>
                <p className="mt-1 text-sm font-semibold">{formatHotScore(content.hotScore, content.heatMetric)}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[11px] text-[var(--text-muted)]">更新</p>
                <p className="mt-1 text-sm font-semibold">{new Date(content.updatedAt).toLocaleDateString('zh-CN')}</p>
              </div>
            </div>
            {evidenceList.length > 0 ? (
              <div className="space-y-2">
                {evidenceList.slice(0, 6).map(item => (
                  <div key={`${item.captureId}-${item.rank}`} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="gold-surface rounded-md px-2 py-0.5 text-[10px] font-bold text-[#111]">#{item.rank}</span>
                      <span className="font-semibold text-sm">{layerLabel(item.layer)}</span>
                      <span className="text-xs text-[var(--text-muted)]">{new Date(item.capturedAt).toLocaleDateString('zh-CN')}</span>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">{formatHotScore(item.hotScore, item.heatMetric)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ApiState title="暂无榜单证据" description="该内容还未进入已抓取的榜单快照，可稍后等待自动刷新后再看。" />
            )}
          </div>
        </section>

        {/* 榜单趋势 */}
        <section className="mb-6 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold">榜单趋势</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
            {trendItems.length > 0 ? (
              <div className="flex h-28 items-end gap-1.5">
                {trendItems.map((item, index) => {
                  const score = 'hotScore' in item ? Number(item.hotScore) : Number(item.top?.hotScore || 0);
                  const max = Math.max(1, ...trendItems.map(entry => ('hotScore' in entry ? Number(entry.hotScore) : Number(entry.top?.hotScore || 0))));
                  return (
                    <div key={`${'captureId' in item ? item.captureId : index}-${index}`} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="w-full rounded-t-md bg-[var(--accent-primary)] transition-all" style={{ height: `${Math.max(8, (score / max) * 80)}px` }} />
                      <span className="text-[10px] text-[var(--text-muted)]">{index + 1}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ApiState title="暂无趋势数据" description="后台抓取榜单快照后，这里会显示热度走势。" />
            )}
          </div>
        </section>

        {/* 同IP其他形式 */}
        {content.relatedContents && content.relatedContents.length > 0 && (
          <section className="mb-6 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">同IP其他形式</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
            </div>
            <div className="rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-[var(--bg-card)] border border-[var(--border)]">
              {content.relatedContents.map((item) => (
                <RelatedCard key={item.id} content={item} />
              ))}
            </div>
          </section>
        )}

        {/* 相似推荐 */}
        {content.similarContents && content.similarContents.length > 0 && (
          <section className="mb-6 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">相似推荐</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
            </div>
            <div className="rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-[var(--bg-card)] border border-[var(--border)]">
              {content.similarContents.map((item) => (
                <RelatedCard key={item.id} content={item} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
