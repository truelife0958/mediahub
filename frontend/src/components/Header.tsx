import { Link } from 'react-router-dom';
import { IconUser } from './Icons';

export default function Header({ children }: { children?: React.ReactNode }) {
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
            to="/profile"
            className="ml-auto flex-shrink-0 flex items-center gap-2 text-sm py-2 px-3 md:px-4 rounded-lg md:rounded-xl font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] transition-all duration-200 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-light)]"
          >
            <IconUser size={16} />
            个人中心
          </Link>
        </div>
        {children}
      </div>
    </header>
  );
}
