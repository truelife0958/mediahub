export interface Content {
  id: string;
  title: string;
  cover: string;
  summary: string;
  type: 'drama' | 'novel' | 'comic' | 'anime';
  tags: string[];
  actors: string[];
  author: string;
  ipName: string;
  status: 'ongoing' | 'completed';
  hotScore: number;
  createdAt: string;
  updatedAt: string;
  cachedAt?: string;
  stale?: boolean;
  source?: {
    provider: string;
    label: string;
    url?: string;
  };
  relatedContents?: Content[];
  similarContents?: Content[];
  reason?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface SourceStatus {
  type: Content['type'];
  source: string;
  status: 'success' | 'failed';
  count: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface User {
  id: string;
  username: string;
  watchHistory: WatchHistoryItem[];
  favorites: string[];
}

export interface WatchHistoryItem {
  content: Content;
  watchedAt: string;
}

export interface ApiResponse<T> {
  code: number;
  data?: T;
  message?: string;
  error?: string;
}

export class ApiClientError extends Error {
  status: number;
  code?: number;
  error?: string;

  constructor(message: string, status: number, code?: number, error?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.error = error;
  }
}

export interface PaginatedResponse<T> {
  list: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  stale?: boolean;
}

export interface QueryParams {
  type: Content['type'];
  page?: number;
  limit?: number;
  keyword?: string;
  sort?: 'hot' | 'latest';
}
