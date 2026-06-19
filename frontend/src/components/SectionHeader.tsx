interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0">
        <h2 className="text-xl md:text-2xl font-bold leading-tight tracking-[-0.02em]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      <div className="flex-1 h-px mb-2 bg-gradient-to-r from-[var(--border)] to-transparent" />
    </div>
  );
}
