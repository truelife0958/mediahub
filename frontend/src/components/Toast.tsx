import type { ToastState } from '../hooks/useToast';

const ICON_MAP: Record<ToastState['type'], string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
};

const COLOR_MAP: Record<ToastState['type'], string> = {
  success: 'var(--accent-primary)',
  error: 'var(--accent-secondary)',
  info: 'var(--accent-cyan)',
};

interface ToastProps {
  toast: ToastState;
}

export default function Toast({ toast }: ToastProps) {
  if (!toast.show) return null;

  return (
    <div className="toast show">
      <span style={{ color: COLOR_MAP[toast.type] }}>{ICON_MAP[toast.type]}</span>
      {' '}{toast.message}
    </div>
  );
}
