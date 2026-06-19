import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteUserSubscription,
  getUserFavorites,
  getUserFollows,
  getUserHistory,
  getUserPreferenceProfile,
  getUserSubscriptions,
  logoutUser,
  registerUser,
} from '../api';
import { useSharedUser } from '../hooks/useSharedUser';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import ContentGrid from '../components/ContentGrid';
import ApiState from '../components/ApiState';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { IconHeart, IconHistory } from '../components/Icons';
import { CATEGORY_TEXT } from '../constants';
import type { Content, UserKeywordSubscription, UserPreferenceProfile, WatchHistoryEntry } from '../types';

export default function Me() {
  const { user, refresh: refreshUser } = useSharedUser();
  const [favorites, setFavorites] = useState<Content[]>([]);
  const [follows, setFollows] = useState<Content[]>([]);
  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserKeywordSubscription[]>([]);
  const [profile, setProfile] = useState<UserPreferenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const { toast, showToast, hideToast } = useToast();

  const loadAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (!user) {
      setFavorites([]);
      setFollows([]);
      setHistory([]);
      setSubscriptions([]);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const opts = signal ? { signal } : undefined;
      const results = await Promise.allSettled([
        getUserFavorites(opts),
        getUserFollows(opts),
        getUserHistory(opts),
        getUserSubscriptions(opts),
        getUserPreferenceProfile(opts),
      ]);
      if (signal?.aborted) return;
      setFavorites(results[0].status === 'fulfilled' ? results[0].value : []);
      setFollows(results[1].status === 'fulfilled' ? results[1].value : []);
      setHistory(results[2].status === 'fulfilled' ? results[2].value : []);
      setSubscriptions(results[3].status === 'fulfilled' ? results[3].value : []);
      setProfile(results[4].status === 'fulfilled' ? results[4].value : null);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0 && failed.length < results.length) {
        showToast('部分数据加载失败', 'error');
      } else if (failed.length === results.length) {
        setError('加载失败');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => { controller.abort(); };
  }, [user, loadAll]);

  const historyItems = useMemo(() => history.map(item => item.content), [history]);

  async function handleDeleteSubscription(id: number) {
    setSaving(true);
    try {
      await deleteUserSubscription(id);
      setSubscriptions(prev => prev.filter(item => item.id !== id));
      showToast('已删除订阅', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除订阅失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegister() {
    const value = username.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      await registerUser(value);
      refreshUser();
      setUsername('');
      showToast(`欢迎，${value}`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setSaving(true);
    try {
      await logoutUser();
      refreshUser();
      setFavorites([]);
      setFollows([]);
      setHistory([]);
      setSubscriptions([]);
      setProfile(null);
      showToast('已退出会话', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '退出失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header user={user} />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {/* 用户身份卡 */}
        <section className="section-shell mb-8">
          <SectionHeader title="我的空间" subtitle="管理收藏、追更和已看记录，获取个性化推荐。" />
          {!user ? (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-[var(--text-secondary)]">输入用户名即可创建本地会话，不需要密码。收藏和已看记录会与当前浏览器绑定。</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.slice(0, 50))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }}
                  placeholder="输入用户名，例如：短剧观察员"
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={saving || !username.trim()}
                  className="gold-surface rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60 cursor-pointer border-0 transition-opacity"
                >
                  {saving ? '创建中...' : '创建并登录'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{user.username}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {favorites.length} 收藏 · {follows.length} 追更 · {history.length} 已看
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={saving}
                className="control-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                退出会话
              </button>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-[var(--accent-secondary)]">{error}</p>}
        </section>

        {loading ? (
          <ContentGrid items={[]} loading emptyTitle="加载中" emptyDesc="正在读取用户数据。" />
        ) : !user ? (
          <ApiState title="尚未登录" description="创建用户名后即可保存收藏和已看记录。" />
        ) : (
          <div className="space-y-8">
            {/* 收藏 + 追更双栏 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="section-shell">
                <div className="flex items-center gap-2 mb-3">
                  <IconHeart size={16} filled />
                  <SectionHeader title={`我的收藏 ${favorites.length}`} subtitle="" />
                </div>
                <ContentGrid
                  items={favorites}
                  loading={false}
                  cardSize="small"
                  emptyTitle="还没有收藏"
                  emptyDesc="详情页点击收藏即可追踪。"
                />
              </section>

              <section className="section-shell">
                <div className="flex items-center gap-2 mb-3">
                  <IconHistory size={16} />
                  <SectionHeader title={`追更提醒 ${follows.length}`} subtitle="" />
                </div>
                <ContentGrid
                  items={follows}
                  loading={false}
                  cardSize="small"
                  emptyTitle="还没有追更"
                  emptyDesc="详情页点击追更即可集中管理。"
                />
              </section>
            </div>

            {/* 已看记录 */}
            <section className="section-shell">
              <div className="flex items-center gap-2 mb-3">
                <IconHistory size={16} />
                <SectionHeader title={`已看 ${history.length}`} subtitle="标注已看后用于个性化推荐。" />
              </div>
              <ContentGrid
                items={historyItems}
                loading={false}
                emptyTitle="还没有已看记录"
                emptyDesc="进入详情页点击标注已看，即可沉淀推荐信号。"
              />
            </section>

            {/* 关键词订阅 */}
            <section className="section-shell">
              <SectionHeader title="关键词订阅" subtitle="订阅主演、角色或 IP，方便跟踪新内容。" />
              {subscriptions.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {subscriptions.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.keyword}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.type ? CATEGORY_TEXT[item.type] : '全部模块'}</p>
                      </div>
                      <button className="control-button rounded-lg px-3 py-1.5 text-xs font-semibold shrink-0" disabled={saving} onClick={() => handleDeleteSubscription(item.id)}>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <ApiState title="还没有关键词订阅" description="在详情页点击订阅 IP 即可。" />
              )}
            </section>

            {/* 偏好画像 */}
            {profile && (
              <section className="section-shell">
                <SectionHeader title="已看偏好画像" subtitle="根据已看内容统计的偏好。" />
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  {profile.summary && <p className="mb-4 text-sm text-[var(--text-secondary)]">{profile.summary}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(profile.byType || []).map(item => (
                      <div key={item.type} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-center">
                        <p className="text-xs text-[var(--text-muted)]">{CATEGORY_TEXT[item.type]}</p>
                        <p className="mt-1 text-xl font-bold">{item.count}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ['偏好标签', profile.favoriteTags],
                      ['偏好主演', profile.favoriteActors],
                      ['偏好角色', profile.favoriteCharacters],
                      ['偏好IP', profile.favoriteIps],
                    ].map(([title, list]) => (
                      <div key={String(title)} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                        <p className="mb-2 text-sm font-semibold">{String(title)}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(list as Array<{ name: string; count: number }>).length
                            ? (list as Array<{ name: string; count: number }>).slice(0, 8).map(item => <span key={item.name} className="gold-surface rounded-md px-2 py-0.5 text-xs font-semibold">{item.name} · {item.count}</span>)
                            : <span className="text-xs text-[var(--text-muted)]">暂无</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}
