import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconFullscreen, IconGear, IconSearch } from './Icons';
import { CATEGORY_TEXT, VISIBLE_CONTENT_TYPES } from '../constants';
import type { Content } from '../types';
import { formatDashboardClock } from '../utils/dashboardClock';

const NAV_TYPES: Content['type'][] = [...VISIBLE_CONTENT_TYPES];
const MODULE_PATH: Record<Content['type'], string> = {
  drama: '/drama',
  novel: '/novel',
  anime: '/anime',
  comic: '/comic',
};

export default function Header({
  children,
  activeType,
  variant = 'dark',
}: {
  children?: ReactNode;
  activeType?: Content['type'];
  variant?: 'dark' | 'light' | 'dashboard';
}) {
  const isDashboard = variant === 'dashboard';
  const isLight = variant === 'light';
  const [now, setNow] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const headerClassName = isDashboard ? 'header-dashboard-shell' : isLight ? 'glass-light' : 'glass-strong';
  const actionClassName = isDashboard
    ? 'header-dashboard-action'
    : isLight
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#d9e1ed] bg-white text-[#475569] text-xs font-semibold transition-colors hover:text-[#0f172a] hover:bg-[#fff7ed]'
    : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] text-xs font-semibold transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]';
  const clock = useMemo(() => now ? formatDashboardClock(now) : null, [now]);

  useEffect(() => {
    if (!isDashboard) return undefined;

    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isDashboard]);

  useEffect(() => {
    if (!isDashboard) return undefined;

    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isDashboard]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void document.documentElement.requestFullscreen();
  }, []);

  return (
    <header className={`sticky top-0 z-50 ${headerClassName}`}>
      <div className={isDashboard ? 'header-dashboard-inner' : 'max-w-7xl mx-auto px-3 md:px-6 py-2.5 md:py-3'}>
        <div className={isDashboard ? 'header-dashboard-row' : 'flex items-center gap-2 md:gap-3'}>
          <Link to="/" className={isDashboard ? 'header-dashboard-brand' : 'flex items-center gap-2 group shrink-0'}>
            <div className={isDashboard ? 'header-dashboard-brand-mark' : 'gold-surface w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-transform group-hover:scale-105'}>
              MH
            </div>
            <div className={isDashboard ? 'header-dashboard-brand-copy' : 'hidden sm:block'}>
              <h1 className={`text-base md:text-lg font-bold tracking-tight ${isDashboard ? '' : isLight ? 'text-slate-900' : ''}`}>
                {isDashboard ? '热门数据' : 'MediaHub'}
              </h1>
              {isDashboard && <p>短剧 / 小说 / 动漫 / 漫画综合热榜</p>}
            </div>
          </Link>

          <nav className={isDashboard ? 'header-dashboard-nav scrollbar-none' : 'flex items-center overflow-x-auto scrollbar-none ml-1 md:ml-2 gap-0.5 md:gap-1'}>
            {NAV_TYPES.map(type => (
              <Link
                key={type}
                to={MODULE_PATH[type]}
                className={`control-button whitespace-nowrap text-xs font-semibold ${isDashboard ? 'header-dashboard-chip' : 'rounded-lg px-2 md:px-2.5 py-1.5'} ${isLight ? 'header-light-chip' : ''} ${activeType === type ? 'is-active' : ''}`}
              >
                {isDashboard ? `${CATEGORY_TEXT[type]}榜` : CATEGORY_TEXT[type]}
              </Link>
            ))}
          </nav>

          {isDashboard && (
            <div className="header-dashboard-clock" aria-label="当前榜单时间">
              <span>{clock?.date || '---- -- --'}</span>
              <strong>{clock?.time || '--:--:--'}</strong>
              <em>{clock?.weekday || '--'}</em>
            </div>
          )}

          <div className={isDashboard ? 'header-dashboard-actions' : 'ml-auto flex items-center gap-1.5 shrink-0'}>
            <Link
              to="/search"
              className={actionClassName}
              title="数据检索"
            >
              <IconSearch size={13} />
              <span className="hidden md:inline">检索</span>
            </Link>
            {isDashboard && (
              <button
                type="button"
                onClick={handleFullscreen}
                className={actionClassName}
                title={isFullscreen ? '退出全屏' : '全屏看板'}
              >
                <IconFullscreen size={13} />
                <span className="hidden md:inline">{isFullscreen ? '退出全屏' : '全屏'}</span>
              </button>
            )}
            <Link
              to="/admin"
              className={actionClassName}
              title="后台管理"
            >
              <IconGear size={13} />
              <span className="hidden md:inline">管理</span>
            </Link>
          </div>
        </div>
        {children && <div className={isDashboard ? 'header-dashboard-children' : 'mt-2.5 md:mt-3'}>{children}</div>}
      </div>
    </header>
  );
}
