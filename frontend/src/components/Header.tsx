import { Link } from 'react-router-dom';
import { IconGear, IconUser } from './Icons';
import { CATEGORY_TEXT } from '../constants';
import type { Content, UserProfile } from '../types';

const NAV_TYPES: Content['type'][] = ['drama', 'novel', 'comic', 'anime'];
const MODULE_PATH: Record<Content['type'], string> = {
  drama: '/drama',
  novel: '/novel',
  comic: '/comic',
  anime: '/anime',
};

export default function Header({
  children,
  user,
  activeType,
}: {
  children?: React.ReactNode;
  user?: UserProfile | null;
  activeType?: Content['type'];
}) {
  return (
    <header className="sticky top-0 z-50 glass-strong">
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-2.5 md:py-3">
        <div className="flex items-center gap-2 md:gap-3">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="gold-surface w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-transform group-hover:scale-105">
              MH
            </div>
            <h1 className="text-base md:text-lg font-bold tracking-tight hidden sm:block">MediaHub</h1>
          </Link>

          <nav className="flex items-center gap-0.5 md:gap-1 overflow-x-auto scrollbar-none ml-1 md:ml-2">
            {NAV_TYPES.map(type => (
              <Link
                key={type}
                to={MODULE_PATH[type]}
                className={`control-button whitespace-nowrap rounded-lg px-2 md:px-2.5 py-1.5 text-xs font-semibold ${activeType === type ? 'is-active' : ''}`}
              >
                {CATEGORY_TEXT[type]}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <Link
              to="/me"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              title={user?.username ? `我的 · ${user.username}` : '我的'}
            >
              <IconUser size={13} />
              <span className="truncate max-w-[80px] hidden sm:inline">{user?.username || '我的'}</span>
              <span className="sm:hidden">我的</span>
            </Link>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] text-xs font-semibold transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
              title="后台管理"
            >
              <IconGear size={13} />
              <span className="hidden md:inline">管理</span>
            </Link>
          </div>
        </div>
        {children && <div className="mt-2.5 md:mt-3">{children}</div>}
      </div>
    </header>
  );
}
