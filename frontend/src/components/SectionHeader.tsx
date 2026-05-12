interface SectionHeaderProps {
  title: string;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <h2 className="text-[1.35rem] md:text-[1.55rem] font-bold leading-tight">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
    </div>
  );
}
