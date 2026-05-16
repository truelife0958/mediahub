import type { ReactNode } from 'react';

interface AdminMetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'gold' | 'cyan' | 'purple' | 'red' | 'green' | 'warn';
}

const toneClasses: Record<NonNullable<AdminMetricCardProps['tone']>, string> = {
  gold: 'from-[rgba(232,168,56,0.18)] to-[rgba(232,168,56,0.02)] border-[rgba(232,168,56,0.24)]',
  cyan: 'from-[rgba(6,182,212,0.18)] to-[rgba(6,182,212,0.02)] border-[rgba(6,182,212,0.22)]',
  purple: 'from-[rgba(139,92,246,0.18)] to-[rgba(139,92,246,0.02)] border-[rgba(139,92,246,0.22)]',
  red: 'from-[rgba(239,68,68,0.16)] to-[rgba(239,68,68,0.02)] border-[rgba(239,68,68,0.22)]',
  green: 'from-[rgba(34,197,94,0.16)] to-[rgba(34,197,94,0.02)] border-[rgba(34,197,94,0.22)]',
  warn: 'from-[rgba(245,158,11,0.16)] to-[rgba(245,158,11,0.02)] border-[rgba(245,158,11,0.22)]',
};

export function AdminMetricCard({ label, value, hint, tone = 'gold' }: AdminMetricCardProps) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${toneClasses[tone]}`}>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 text-2xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{value}</div>
      {hint && <p className="mt-2 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

export function AdminSection({ title, description, children, action }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="admin-panel rounded-xl p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">{title}</h3>
          {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-6 text-center text-sm text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'error' }) {
  const cls = tone === 'ok'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : tone === 'error'
        ? 'border-red-500/30 bg-red-500/10 text-red-200'
        : 'border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
