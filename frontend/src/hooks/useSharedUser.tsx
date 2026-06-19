import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { requestJson } from '../api/client';
import type { UserProfile } from '../types';

interface UserContextValue {
  user: UserProfile | null;
  loading: boolean;
  refresh: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const refresh = useCallback(() => {
    setRetryKey(k => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);

    requestJson<UserProfile | null>('/users/me', { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setUser(data);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  return (
    <UserContext.Provider value={{ user, loading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useSharedUser() {
  return useContext(UserContext);
}
