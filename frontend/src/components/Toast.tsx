import { useEffect, useRef, useState } from 'react';
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

const EXIT_ANIMATION_MS = 200;

interface ToastProps {
  toast: ToastState;
  onClose?: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  const [exiting, setExiting] = useState(false);
  const prevShowRef = useRef(toast.show);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // When toast.show transitions from true to false (auto-dismiss), start exit animation
    if (prevShowRef.current && !toast.show) {
      setExiting(true);
      timerRef.current = setTimeout(() => {
        setExiting(false);
      }, EXIT_ANIMATION_MS);
    }
    // When toast.show becomes true, ensure we're not in exiting state
    if (toast.show) {
      setExiting(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    prevShowRef.current = toast.show;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.show]);

  if (!toast.show && !exiting) return null;

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      onClose?.();
    }, EXIT_ANIMATION_MS);
  };

  return (
    <div
      className={`toast ${exiting ? 'toast-exit' : 'toast-show'}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: COLOR_MAP[toast.type], color: '#0a0a0f' }}
      >
        {ICON_MAP[toast.type]}
      </span>
      <span className="flex-1 text-sm">{toast.message}</span>
      {onClose && (
        <button
          type="button"
          onClick={handleClose}
          className="ml-1 w-5 h-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] border-0 bg-transparent cursor-pointer text-xs leading-none p-0 transition-colors"
          aria-label="关闭"
        >
          ✕
        </button>
      )}
    </div>
  );
}
