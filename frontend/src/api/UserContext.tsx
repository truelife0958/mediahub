import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  getCurrentUser,
  getWatchHistory,
  registerUser,
  logoutUser,
  markWatched as apiMarkWatched,
  toggleFavorite as apiToggleFavorite,
  getFavorites,
} from './client';
import type { Content } from '../types';
import { UserContext } from './userStore';

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [watchHistory, setWatchHistory] = useState<Content[]>([]);
  const [favorites, setFavorites] = useState<Content[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [userError, setUserError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refreshData = useCallback(() => {
    setRefreshCounter(c => c + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingUser(true);
    getCurrentUser(controller.signal)
      .then(user => {
        if (!user) {
          setUserId(null);
          setUsername(null);
          return;
        }
        setUserId(user.id);
        setUsername(user.username);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setUserError(err.message);
        }
      })
      .finally(() => setIsLoadingUser(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setUserError(null);
    if (!userId) {
      setWatchHistory([]);
      setFavorites([]);
      setFavoriteIds(new Set());
      setWatchedIds(new Set());
      setUsername(null);
      return;
    }
    const controller = new AbortController();
    Promise.all([
      getWatchHistory(controller.signal).catch(err => {
        if (err.name !== 'AbortError') setUserError(err.message);
        return [];
      }),
      getFavorites(controller.signal).catch(() => []),
    ]).then(([history, favs]) => {
      setWatchHistory(history.map(h => h.content).filter(Boolean));
      setWatchedIds(new Set(history.map(h => h.content?.id).filter(Boolean)));
      setFavorites(favs);
      setFavoriteIds(new Set(favs.map((f: Content) => f.id)));
    });
    return () => controller.abort();
  }, [userId, refreshCounter]);

  const handleRegister = useCallback(async (name: string) => {
    const user = await registerUser(name);
    setUserId(user.id);
    setUsername(user.username);
    refreshData();
    return user;
  }, [refreshData]);

  const handleMarkWatched = useCallback(async (contentId: string) => {
    if (!userId) throw new Error('Not logged in');
    await apiMarkWatched(contentId);
    refreshData();
  }, [userId, refreshData]);

  const handleToggleFavorite = useCallback(async (contentId: string) => {
    if (!userId) throw new Error('Not logged in');
    const result = await apiToggleFavorite(contentId);
    refreshData();
    return result.isFavorite;
  }, [userId, refreshData]);

  const logout = useCallback(async () => {
    await logoutUser();
    setUserId(null);
    setUsername(null);
    setWatchHistory([]);
    setFavorites([]);
    setFavoriteIds(new Set());
    setWatchedIds(new Set());
  }, []);

  return (
    <UserContext.Provider value={{
      userId,
      username,
      isLoadingUser,
      register: handleRegister,
      markWatched: handleMarkWatched,
      toggleFavorite: handleToggleFavorite,
      watchHistory,
      favorites,
      favoriteIds,
      watchedIds,
      logout,
      refreshData,
      error: userError,
    }}>
      {children}
    </UserContext.Provider>
  );
}
