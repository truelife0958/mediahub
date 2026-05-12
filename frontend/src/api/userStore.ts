import { createContext, useContext } from 'react';
import type { Content } from '../types';

export interface UserContextValue {
  userId: string | null;
  username: string | null;
  isLoadingUser: boolean;
  register: (username: string) => Promise<{ id: string; username: string }>;
  markWatched: (contentId: string) => Promise<void>;
  toggleFavorite: (contentId: string) => Promise<boolean>;
  watchHistory: Content[];
  favorites: Content[];
  favoriteIds: Set<string>;
  watchedIds: Set<string>;
  logout: () => Promise<void>;
  refreshData: () => void;
  error: string | null;
}

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
}
