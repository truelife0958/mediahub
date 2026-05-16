export interface Content {
  id: string;
  title: string;
  cover?: string;
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

export interface SourceStatus {
  type: Content['type'];
  source: string;
  status: 'success' | 'failed';
  count: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface SourceHealth {
  type: Content['type'];
  source: string;
  attempts: number;
  successes: number;
  emptyHits: number;
  failures: number;
  rateLimited: number;
  consecutiveFailures: number;
  ewmaLatencyMs: number;
  score: number;
  lastStatus: 'unknown' | 'success' | 'empty' | 'rate_limited' | 'failed';
  lastError: string | null;
  updatedAt: string;
}

export interface SourceRoutingSettings {
  defaults: Record<Content['type'], string[]>;
  supported: Record<Content['type'], string[]>;
  effective: Record<Content['type'], string[]>;
  overrides: Record<Content['type'], string[]>;
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  persistedTo?: 'runtime' | 'env';
  envFilePath?: string;
  source?: {
    enabled?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };
}

export interface SystemSettings {
  autoRefresh: {
    enabled: boolean;
    hour: number;
    minute: number;
    runOnStartup: boolean;
  };
  ingestBackfill: {
    pages: number;
    pageSize: number;
    sorts: string[];
  };
  cache: {
    ttlMs: number;
    timeoutMs: number;
    retryMaxAttempts?: number;
    retryBaseDelayMs?: number;
  };
  sourceRouting?: SourceRoutingSettings;
}

export interface ContentQualityStats {
  total: number;
  missingCover: number;
  missingSummary: number;
  missingTags: number;
  lowHotScore: number;
  qualityScore: number;
  byType: Array<{
    type: Content['type'];
    total: number;
    missingCover: number;
    missingSummary: number;
    missingTags: number;
    lowHotScore: number;
  }>;
  duplicateCandidates: Array<Array<{
    id: string;
    title: string;
    type: Content['type'];
    ipName: string;
    hotScore: number;
  }>>;
}

export interface SourceRunLog extends SourceStatus {
  id: number;
  category?: string;
}

export interface AdminSummary {
  totalContents: number;
  countsByType: Record<Content['type'], number>;
  sourceStatuses: SourceStatus[];
  sourceHealth: SourceHealth[];
  aiConfig: AiConfig;
  routing: SourceRoutingSettings;
  quality: ContentQualityStats;
  recentRuns: SourceRunLog[];
  runStats: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    successRate: number;
  };
  cost: {
    estimatedPromptTokens: number;
    estimatedCostUsd: number;
    currency: string;
    note: string;
  };
}

export interface AdminLogs {
  runs: SourceRunLog[];
  errorSummary: Record<string, number>;
}
