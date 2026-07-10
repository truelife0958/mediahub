interface AdminAccessGateProps {
  password: string;
  loading: boolean;
  loggingIn: boolean;
  error: string | null;
  onPasswordChange: (password: string) => void;
  onLogin: () => void;
}

export default function AdminAccessGate({
  password,
  loading,
  loggingIn,
  error,
  onPasswordChange,
  onLogin,
}: AdminAccessGateProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="admin-panel rounded-2xl p-3 lg:self-start">
        <div className="mb-3 px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Data Panel</p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">数据面板</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">仅管理员可查看采集状态和 JSON 数据</p>
        </div>
        <a
          href="/"
          className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          返回前台
        </a>
      </aside>

      <section className="min-w-0">
        <div className="admin-panel rounded-2xl p-4 md:p-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Restricted</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">管理员登录</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">登录后可查看数据更新状态、手动刷新、最近采集日志和 JSON 文件预览。</p>
          </div>

          <div className="mt-6 max-w-lg rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 md:p-5">
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              管理员密码
              <input
                type="password"
                value={password}
                onChange={event => onPasswordChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    onLogin();
                  }
                }}
                placeholder="请输入管理员密码"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onLogin}
                disabled={loggingIn || loading}
                className="gold-surface rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingIn ? '登录中...' : '登录'}
              </button>
              <a href="/" className="text-sm font-semibold text-[var(--text-secondary)] underline decoration-dotted underline-offset-4 hover:text-[var(--text-primary)]">
                返回前台
              </a>
            </div>
            {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
            <p className="mt-4 text-xs text-[var(--text-muted)]">默认密码：MediaHub@2026，可通过环境变量 MEDIAHUB_ADMIN_PASSWORD 覆盖。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
