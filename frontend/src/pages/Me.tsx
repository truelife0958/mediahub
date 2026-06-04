import { useEffect, useMemo, useState } from 'react';
import {
  getUserFavorites,
  getUserHistory,
  getCurrentUser,
  logoutUser,
  registerUser,
} from '../api';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import ContentGrid from '../components/ContentGrid';
import ApiState from '../components/ApiState';
import { IconHeart, IconHistory } from '../components/Icons';
import type { Content, UserProfile, WatchHistoryEntry } from '../types';

export default function Me() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<Content[]>([]);
  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      if (!currentUser) {
        setFavorites([]);
        setHistory([]);
        return;
      }

      const [favoriteData, historyData] = await Promise.all([
        getUserFavorites(),
        getUserHistory(),
      ]);
      setFavorites(favoriteData);
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const historyItems = useMemo(() => history.map(item => item.content), [history]);

  async function handleRegister() {
    const value = username.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      const nextUser = await registerUser(value);
      setUser(nextUser);
      setUsername('');
      await loadAll();
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
      setUser(null);
      setFavorites([]);
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <section className="section-shell mb-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
          <SectionHeader title="我的空间" subtitle="管理收藏、最近浏览，并保留个性化推荐所需的最小用户状态。" />
          {!user ? (
            <div className="max-w-xl">
              <p className="mb-4 text-sm text-[var(--text-secondary)]">输入一个用户名即可创建本地会话，不需要密码。收藏和浏览历史会与当前浏览器会话绑定。</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.slice(0, 50))}
                  placeholder="输入用户名，例如：短剧观察员"
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={saving || !username.trim()}
                  className="gold-surface rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? '创建中...' : '创建并登录'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{user.username}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">已记录 {favorites.length} 个收藏，{history.length} 条最近浏览。</p>
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
          <ApiState title="尚未登录" description="创建用户名后即可保存收藏和最近浏览。" />
        ) : (
          <div className="space-y-8">
            <section className="section-shell">
              <SectionHeader title="我的收藏" subtitle="适合持续追踪的短剧、小说、漫画、动漫。" />
              <div className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <IconHeart size={16} filled />
                当前收藏 {favorites.length} 条
              </div>
              <ContentGrid
                items={favorites}
                loading={false}
                emptyTitle="还没有收藏内容"
                emptyDesc="进入详情页后点击收藏，即可在这里持续追踪。"
              />
            </section>

            <section className="section-shell">
              <SectionHeader title="最近浏览" subtitle="最近打开过的内容会自动记录，便于回看。" />
              <div className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <IconHistory size={16} />
                最近浏览 {history.length} 条
              </div>
              <ContentGrid
                items={historyItems}
                loading={false}
                emptyTitle="还没有浏览记录"
                emptyDesc="查看任意详情页后，这里会自动追加记录。"
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
