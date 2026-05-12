import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from '../api';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { IconBack, IconLogout } from '../components/Icons';
import type { Content } from '../types';

function ContentGrid({
  items,
  emptyIcon,
  emptyTitle,
  emptyDesc,
}: {
  items: Content[];
  emptyIcon: string;
  emptyTitle: string;
  emptyDesc: string;
}) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center bg-[var(--bg-card)] border border-[var(--border)]">
        <div className="text-4xl mb-3">{emptyIcon}</div>
        <h4 className="font-semibold mb-2">{emptyTitle}</h4>
        <p className="text-sm mb-5 text-[var(--text-muted)]">{emptyDesc}</p>
        <Link
          to="/"
            className="gold-surface inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:-translate-y-px"
        >
          去探索
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map(item => (
        <div
          key={item.id}
          className="group cursor-pointer"
          onClick={() => navigate(`/detail/${item.id}`)}
        >
          <div className="relative rounded-xl overflow-hidden mb-2 h-[190px] transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-[var(--shadow-card)]">
            <img src={item.cover} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
          <h4 className="font-medium text-sm truncate group-hover:text-[var(--accent-primary)] transition-colors mb-1">
            {item.title}
          </h4>
          <p className="text-xs truncate text-[var(--text-muted)]">
            {item.actors?.length > 0 ? item.actors.slice(0, 2).join(' · ') : item.author}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { userId, username, isLoadingUser, register, watchHistory, favorites, logout } = useUser();
  const [inputName, setInputName] = useState('');
  const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');
  const { toast, showToast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;

    try {
      const user = await register(inputName.trim());
      setInputName('');
      showToast(`欢迎回来，${user.username}！`);
    } catch {
      showToast('登录失败', 'error');
    }
  };

  const handleLogout = useCallback(() => {
    logout()
      .then(() => showToast('已退出登录', 'info'))
      .catch(() => showToast('退出失败', 'error'));
  }, [logout, showToast]);

  const watchedByType = (type: string) => watchHistory.filter(item => item.type === type).length;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <IconBack size={16} />
            </button>
            <h1 className="font-semibold text-base">个人中心</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {isLoadingUser ? (
          <div className="w-full max-w-[400px] mx-auto rounded-2xl p-6 sm:p-8 bg-[var(--bg-card)] border border-[var(--border)]">
            <div className="text-center">
              <div className="w-9 h-9 mx-auto border-2 border-[var(--border)] border-t-[var(--accent-primary)] rounded-full animate-spin mb-4" />
              <p className="text-sm text-[var(--text-muted)]">加载用户信息...</p>
            </div>
          </div>
        ) : !userId ? (
          <div className="w-full max-w-[400px] mx-auto rounded-2xl p-6 sm:p-8 bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
            <div className="text-center mb-6">
              <div className="gold-surface w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center text-2xl">
                ME
              </div>
              <h2 className="text-xl font-bold mb-2">欢迎回来</h2>
              <p className="text-sm text-[var(--text-muted)]">登录后同步观看记录，获得个性化推荐</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <input
                type="text"
                value={inputName}
                onChange={event => setInputName(event.target.value)}
                placeholder="输入用户名"
                maxLength={50}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="submit"
                className="gold-surface w-full inline-flex items-center justify-center px-5 py-3 rounded-xl font-semibold text-base border-0 cursor-pointer transition-all duration-200 hover:-translate-y-px"
              >
                开始探索
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl p-5 bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
              <div className="profile-user-row">
                <div className="flex items-center gap-3">
                  <div className="gold-surface w-12 h-12 rounded-xl flex items-center justify-center text-2xl">
                    ME
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{username || '用户'}</h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      ID: {userId.slice(0, 8)}...{userId.slice(-4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm py-2 px-3 rounded-lg font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-card-hover)]"
                >
                  <IconLogout size={16} />
                  退出
                </button>
              </div>
            </div>

            <div className="profile-stats-grid">
              {[
                { label: '观看记录', value: watchHistory.length, color: 'var(--accent-primary)' },
                { label: '短剧', value: watchedByType('drama'), color: 'var(--accent-secondary)' },
                { label: '动漫', value: watchedByType('anime'), color: 'var(--accent-cyan)' },
                { label: '收藏', value: favorites.length, color: 'var(--accent-tertiary)' },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl p-4 text-center bg-[var(--bg-card)] border border-[var(--border)]">
                  <div className="text-2xl font-bold mb-1 font-[tabular-nums]" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="profile-tabs">
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 border cursor-pointer ${activeTab === 'history' ? 'text-[var(--text-primary)] bg-[var(--bg-card)] border-[var(--border)]' : 'text-[var(--text-muted)] bg-transparent border-transparent hover:text-[var(--text-secondary)]'}`}
              >
                观看历史
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 border cursor-pointer ${activeTab === 'favorites' ? 'text-[var(--text-primary)] bg-[var(--bg-card)] border-[var(--border)]' : 'text-[var(--text-muted)] bg-transparent border-transparent hover:text-[var(--text-secondary)]'}`}
              >
                我的收藏
              </button>
            </div>

            {activeTab === 'history' && (
              <ContentGrid
                items={watchHistory}
                emptyIcon="历史"
                emptyTitle="还没有观看记录"
                emptyDesc="去首页标记你喜欢的内容吧"
              />
            )}

            {activeTab === 'favorites' && (
              <ContentGrid
                items={favorites}
                emptyIcon="收藏"
                emptyTitle="还没有收藏内容"
                emptyDesc="点击卡片上的收藏按钮添加收藏"
              />
            )}
          </div>
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
