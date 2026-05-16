interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-end gap-3 mb-5">
      <div className="min-w-0">
        <h2 className="text-[1.35rem] md:text-[1.55rem] font-bold leading-tight tracking-[-0.02em]">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-xs md:text-sm text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      <div className="flex-1 h-px mb-2 bg-gradient-to-r from-[var(--border)] via-[rgba(232,168,56,0.18)] to-transparent" />
    </div>
  );
}
