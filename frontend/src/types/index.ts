export type ContentType = 'drama' | 'novel' | 'anime' | 'comic';


export type RankingEvidenceType = 'platform_rank' | 'official_rank' | 'annual_rank' | 'manual_verified' | 'topic_signal' | 'search_index' | 'source_score';

export type SourceConfidence = 'high' | 'medium' | 'low';

export interface RankingEvidence {
  sourceId?: string;
  sourceName: string;
  sourceUrl: string;
  capturedAt?: string;
  rank?: number;
  score?: number;
  evidenceType: RankingEvidenceType;
  confidence?: number;
  note?: string;
}

export interface RankingMeta {
  sourceConfidence: SourceConfidence;
  rankingReason: string;
  bestPlatformRank?: number;
  authorityRank?: number;
  sourceNames: string[];
}

export interface HotTrendPoint {
  date: string;
  score: number;
  rank: number;
  capturedAt?: string;
}

export interface Content {
  id: string;
  title: string;
  cover?: string;
  summary: string;
  type: ContentType;
  tags: string[];
  actors: string[];
  characters?: string[];
  author: string;
  ipName: string;
  status: 'ongoing' | 'completed';
  hotScore: number;
  heatMetric?: 'playback' | 'reading';
  createdAt: string;
  updatedAt: string;
  cachedAt?: string;
  stale?: boolean;
  source?: {
    provider: string;
    label: string;
    url?: string;
  };
  metrics?: {
    playOrReadYi?: number;
    platformHeatWan?: number;
    likesWan?: number;
    favoritesWan?: number;
    searchIndex?: number;
    topicPlayYi?: number;
    topicSignalScore?: number;
    platformHotRank?: number;
    newDramaRank?: number;
    playOrReadScore?: number;
    platformHeatScore?: number;
    searchIndexScore?: number;
    topicScore?: number;
    sourceSignalScore?: number;
    sourceSignalCount?: number;
    sourceConfidenceScore?: number;
    platformRankScore?: number;
    platformOriginalRank?: number;
    authorityRankScore?: number;
    authorityOriginalRank?: number;
    totalScore?: number;
  };
  rank?: number;
  relations?: ContentRelations;
  leaderboardEvidence?: ContentEvidence[];
  rankingEvidence?: RankingEvidence[];
  rankingMeta?: RankingMeta;
  hotSignals?: HotSignal[];
  trend?: HotTrendPoint[];
  relatedContents?: Content[];
  similarContents?: Content[];
}

export interface HotSignal {
  platform: 'baidu' | 'weibo' | 'douyin' | 'wechat' | string;
  platformName: string;
  keyword: string;
  rank?: number;
  sourceUrl?: string;
  capturedAt?: string;
  searchIndex?: number;
  topicPlayYi?: number;
  heatValue?: number;
  topicSignalScore?: number;
}

export interface ContentEvidence {
  label?: string;
  sourceUrl?: string;
  url?: string;
  capturedAt?: string;
  rank?: number;
  value?: number | string;
  evidence?: Record<string, unknown>;
}

export interface ContentRelationRef {
  id: string;
  type: Content['type'];
  title: string;
  rank: number;
  source: string;
  sourceName: string;
  hotScore: number;
  matchedBy?: 'ip' | 'actor' | 'category';
  matchedValues?: string[];
}

export interface ContentRelations {
  sameIp: ContentRelationRef[];
  sameActors: ContentRelationRef[];
  sameCategories: ContentRelationRef[];
  sameCategory?: ContentRelationRef[];
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

export interface IngestionRefreshResult {
  type: Content['type'];
  status: 'success' | 'failed';
  count: number;
  durationMs?: number;
  error?: string;
  supplementalSignals?: {
    count: number;
    errors: Array<{ platform: string; message: string }>;
  };
}

export interface AutoRefreshRuntimeStatus {
  started: boolean;
  enabled: boolean;
  mode: 'daily' | 'interval';
  intervalMinutes: number;
  hour: number;
  minute: number;
  runOnStartup: boolean;
  scheduled: boolean;
  running: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastTrigger: string;
  lastError: string | null;
  lastResults: IngestionRefreshResult[];
  updatedAt: string | null;
  backfill: {
    pageCount: number;
    pageSize: number;
    sortModes: string[];
  };
}

export interface JsonDataStatus {
  types: Array<{
    type: Content['type'];
    count: number;
    date: string;
    capturedAt: string;
  }>;
  indexes: {
    actor: number;
    ip: number;
    category: number;
  };
}

export interface CrawlLogRun {
  id: string;
  type: Content['type'];
  source: string;
  status: 'success' | 'failed';
  count: number;
  partial?: boolean;
  attemptedPages?: number;
  failedPages?: number;
  warning?: string | null;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string;
  jsonDataset?: {
    count: number;
    capturedAt: string;
    date: string;
  };
  items?: Array<{
    id: string;
    title: string;
    source: string;
    hotScore?: number;
    metrics?: Content['metrics'];
  }>;
  supplementalSignals?: {
    count: number;
    errors: Array<{ platform: string; message: string }>;
  };
}

export interface JsonDataPreview {
  type: Content['type'];
  file: string;
  exists: boolean;
  date: string;
  capturedAt: string;
  count: number;
  items: Array<{
    id: string;
    type: Content['type'];
    title: string;
    rank: number;
    source: string;
    sourceName: string;
    sourceUrl?: string;
    actors: string[];
    author: string;
    ipName: string;
    categories: string[];
    metrics: Content['metrics'];
    hotSignals?: HotSignal[];
    rankingEvidence?: RankingEvidence[];
    rankingMeta?: RankingMeta;
    capturedAt: string;
  }>;
  latestLog: {
    file: string;
    date: string;
    updatedAt: string;
    runs: CrawlLogRun[];
  };
}

export interface RefreshAllContentTypesResponse {
  results: IngestionRefreshResult[];
  status: AutoRefreshRuntimeStatus;
}

export type TopicField = 'actor' | 'character' | 'author' | 'ip' | 'category';

export interface DiscoveryResponse {
  keyword: string;
  sort: 'hot' | 'latest';
  minHotScore: number;
  total: number;
  counts: Record<Content['type'], number>;
  groups: Record<Content['type'], Content[]>;
  stale: boolean;
}

export interface IpUniverseResponse {
  ipName: string;
  total: number;
  groups: Record<Content['type'], Content[]>;
  top: Content[];
}

export interface EntityProfileResponse {
  field: TopicField;
  value: string;
  total: number;
  groups: Record<Content['type'], Content[]>;
  top: Content[];
  tags: Array<{ name: string; count: number }>;
}

export interface SearchExplainResponse {
  id: string;
  keyword: string;
  fields: string[];
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
  boundaryRisks?: Array<{
    id: string;
    title: string;
    type: Content['type'];
    reason: string;
  }>;
  reviewQueue?: Array<{
    id: string;
    title: string;
    type: Content['type'];
    issues: string[];
    suggestion: string;
  }>;
}

export interface SourceRunLog extends SourceStatus {
  id: number;
  category?: string;
}

export interface AdminSummary {
  totalContents: number;
  countsByType: Record<Content['type'], number>;
  sourceStatuses: SourceStatus[];
  quality: ContentQualityStats;
  recentRuns: SourceRunLog[];
  runStats: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    successRate: number;
  };
}

export interface AdminLogs {
  runs: SourceRunLog[];
  errorSummary: Record<string, number>;
}
