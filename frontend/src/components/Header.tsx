import { Link } from 'react-router-dom';
import { IconGear, IconUser } from './Icons';
import type { UserProfile } from '../types';

export default function Header({
  children,
  user,
}: {
  children?: React.ReactNode;
  user?: UserProfile | null;
}) {
  return (
    <header className="sticky top-0 z-50 glass-strong">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
        <div className="flex flex-wrap items-center gap-3 mb-3 md:mb-4">
          <Link to="/" className="flex items-center gap-3 group min-w-0">
            <div className="gold-surface w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black transition-transform group-hover:scale-105">
              MH
            </div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight truncate">MediaHub</h1>
          </Link>
          <Link
            to="/me"
            className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] text-xs font-semibold transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
          >
            <IconUser size={14} />
            {user?.username ? `我的 · ${user.username}` : '我的'}
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] text-xs font-semibold transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
          >
            <IconGear size={14} />
            后台管理
          </Link>
        </div>
        {children}
      </div>
    </header>
  );
}
