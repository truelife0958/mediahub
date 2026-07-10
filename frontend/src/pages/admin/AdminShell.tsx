import type { ReactNode } from 'react';

export interface AdminTab {
  id: string;
  label: string;
}

export interface AdminModule {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  tabs: AdminTab[];
}

interface AdminShellProps {
  modules: AdminModule[];
  activeModule: string;
  activeTab: string;
  message?: string;
  homeHref?: string;
  onLogout?: () => void;
  onModuleChange: (moduleId: string) => void;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export default function AdminShell({
  modules,
  activeModule,
  activeTab,
  message,
  homeHref = '/',
  onLogout,
  onModuleChange,
  onTabChange,
  children,
}: AdminShellProps) {
  const current = modules.find(item => item.id === activeModule) || modules[0];
  const showSidebar = modules.length > 1;

  return (
    <div className={`grid grid-cols-1 gap-4 ${showSidebar ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : ''}`}>
      {showSidebar && (
        <aside className="admin-panel rounded-2xl p-3 lg:sticky lg:top-24 lg:self-start" data-testid="admin-left-nav">
          <div className="mb-3 px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Data</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">数据面板</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">只保留采集状态和 JSON 数据</p>
          </div>
          <nav className="space-y-1">
            {modules.map(item => {
              const active = item.id === current.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onModuleChange(item.id)}
                  data-testid={`admin-nav-${item.id}`}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${active ? 'border-[rgba(232,168,56,0.42)] bg-[rgba(232,168,56,0.10)] text-[var(--text-primary)] shadow-[0_16px_40px_-28px_rgba(232,168,56,0.9)]' : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.035)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{item.label}</span>
                      <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.subtitle}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <section className="min-w-0">
        <div className="admin-panel rounded-2xl p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)]">当前数据入口</p>
              <h2 className="text-2xl font-black tracking-[-0.03em]">{current.label}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{current.subtitle}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 md:items-end">
              <div className="flex flex-wrap gap-2">
                <a
                  href={homeHref}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  返回前台
                </a>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center justify-center rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs font-bold text-red-200 transition-colors hover:bg-[rgba(239,68,68,0.14)]"
                  >
                    退出后台
                  </button>
                )}
              </div>
              {message && (
                <p
                  className="rounded-xl border border-[rgba(232,168,56,0.18)] bg-[rgba(232,168,56,0.08)] px-3 py-2 text-sm text-[var(--accent-primary)]"
                  data-testid="admin-feedback-message"
                  role="status"
                >
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2 pb-1 md:flex-nowrap md:overflow-x-auto" data-testid="admin-right-tabs">
            {current.tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                data-testid={`admin-tab-${current.id}-${tab.id}`}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${tab.id === activeTab ? 'border-[rgba(232,168,56,0.45)] bg-[rgba(232,168,56,0.14)] text-[var(--text-primary)]' : 'border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div data-testid={`admin-panel-${current.id}-${activeTab}`}>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
