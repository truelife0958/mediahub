import { useState, useCallback, useEffect, useRef } from 'react';

export interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'success',
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ show: true, message, type });
    timerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
      timerRef.current = null;
    }, 2500);
  }, []);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(prev => ({ ...prev, show: false }));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast, hideToast };
}
