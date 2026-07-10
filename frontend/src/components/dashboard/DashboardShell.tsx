import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_TEXT, VISIBLE_CONTENT_TYPES, type VisibleContentType } from '../../constants';
import { formatDashboardClock } from '../../utils/dashboardClock';

interface DashboardShellProps {
  activeType?: VisibleContentType | 'dashboard';
  children: ReactNode;
}

export default function DashboardShell({ activeType = 'dashboard', children }: DashboardShellProps) {
  const [now, setNow] = useState(() => new Date());
  const clock = useMemo(() => formatDashboardClock(now), [now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="dashboard-pro-page">
      <header className="dashboard-pro-header">
        <div className="dashboard-pro-header-inner">
          <Link to="/dashboard" className="dashboard-pro-brand">
            <strong>MediaHub 专业版</strong>
            <span>四模块热度看板</span>
          </Link>
          <nav className="dashboard-pro-nav" aria-label="四模块导航">
            <Link
              to="/dashboard"
              className={activeType === 'dashboard' ? 'is-active' : ''}
              aria-current={activeType === 'dashboard' ? 'page' : undefined}
            >
              综合
            </Link>
            {VISIBLE_CONTENT_TYPES.map(type => (
              <Link
                key={type}
                to={`/${type}`}
                className={activeType === type ? 'is-active' : ''}
                aria-current={activeType === type ? 'page' : undefined}
              >
                {CATEGORY_TEXT[type]}
              </Link>
            ))}
          </nav>
          <div className="dashboard-pro-clock">
            <span>{clock.date}</span>
            <strong>{clock.time}</strong>
            <em>{clock.weekday}</em>
          </div>
          <div className="dashboard-pro-actions">
            <Link to="/search">检索</Link>
            <Link to="/admin">管理</Link>
          </div>
        </div>
      </header>
      <main className="dashboard-pro-main">{children}</main>
    </div>
  );
}
