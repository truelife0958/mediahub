interface ApiStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function ApiState({ title, description, actionLabel = '重试', onAction }: ApiStateProps) {
  return (
    <div className="api-state">
      <div className="api-state-icon">!</div>
      <h3 className="text-base font-semibold mb-1 tracking-[-0.01em]">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4 max-w-md mx-auto leading-relaxed">{description}</p>
      {onAction && (
        <button onClick={onAction} className="api-state-button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
