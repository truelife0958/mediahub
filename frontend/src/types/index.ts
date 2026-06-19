export interface Content {
  id: string;
  title: string;
  cover?: string;
  summary: string;
  type: 'drama' | 'novel' | 'comic' | 'anime';
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
  leaderboardEvidence?: LeaderboardSnapshotItem[];
  relatedContents?: Content[];
  similarContents?: Content[];
  reason?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  recentlyWatchedIds?: string[];
  followingIds?: string[];
  subscriptions?: UserKeywordSubscription[];
}

export interface WatchHistoryEntry {
  content: Content;
  watchedAt: string;
}

export interface UserKeywordSubscription {
  id: number;
  keyword: string;
  type: '' | Content['type'];
  createdAt: string;
  alreadyExists?: boolean;
}

export interface UserPreferenceProfile {
  totalWatched: number;
  byType: Array<{ type: Content['type']; count: number }>;
  favoriteTags: Array<{ name: string; count: number }>;
  favoriteActors: Array<{ name: string; count: number }>;
  favoriteCharacters: Array<{ name: string; count: number }>;
  favoriteIps: Array<{ name: string; count: number }>;
  summary: string;
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

export interface RefreshAllContentTypesResponse {
  results: IngestionRefreshResult[];
  status: AutoRefreshRuntimeStatus;
}

export type TopicField = 'actor' | 'character' | 'author' | 'ip';

export interface DiscoveryResponse {
  keyword: string;
  sort: 'hot' | 'latest';
  minHotScore: number;
  total: number;
  counts: Record<Content['type'], number>;
  groups: Record<Content['type'], Content[]>;
  stale: boolean;
}

export interface TopicContentsResponse extends PaginatedResponse<Content> {
  field: TopicField;
  value: string;
  typeFilter: '' | Content['type'];
  minHotScore: number;
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

export interface CompareResponse {
  ids: string[];
  list: Content[];
  metrics: Array<{
    id: string;
    title: string;
    type: Content['type'];
    hotScore: number;
    heatMetric?: 'playback' | 'reading';
    status: Content['status'];
    tagCount: number;
    actorCount: number;
  }>;
}

export interface SearchExplainResponse {
  id: string;
  keyword: string;
  fields: string[];
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

export interface AiConnectionTestResult {
  ok: boolean;
  status: 'success' | 'disabled' | 'missing_api_key' | 'invalid_config' | 'failed';
  message: string;
  model: string;
  baseUrl: string;
  latencyMs: number;
  httpStatus?: number;
  sample?: string;
  config: AiConfig;
}

export interface SystemSettings {
  autoRefresh: {
    enabled: boolean;
    mode: 'daily' | 'interval';
    intervalMinutes: number;
    failureBackoffEnabled: boolean;
    failureBackoffMultiplier: number;
    failureBackoffMaxMinutes: number;
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
    circuitBreakerFailureThreshold: number;
    circuitBreakerOpenMs: number;
    rateLimitPerSecond: number;
    rateLimitBurst: number;
  };
  notifications?: {
    webhookEnabled: boolean;
    webhookTimeoutMs: number;
    webhookRetryMaxAttempts?: number;
    webhookRetryBaseDelayMs?: number;
  };
  sourceRouting?: SourceRoutingSettings;
}

export type EditableSystemSettings = Omit<SystemSettings, 'sourceRouting'>;

export interface ReferencePromptTemplate {
  version: string;
  name: string;
  status: string;
  prompt: string;
}

export interface ReferenceSettings {
  promptTemplates: ReferencePromptTemplate[];
  keywordPresets: string[];
  recommendationRules: string[];
}

export interface SearchAliasGroup {
  id: number;
  canonicalKeyword: string;
  aliases: string[];
  type: '' | Content['type'];
  enabled: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
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

export interface LeaderboardLayerOption {
  id: 'overall' | 'new' | 'rising' | 'completed';
  name: string;
}

export interface LeaderboardLayerConfig {
  layers: LeaderboardLayerOption[];
  types: Array<Content['type']>;
}

export interface LeaderboardSnapshotItem {
  captureId: string;
  type: Content['type'];
  layer: LeaderboardLayerOption['id'];
  rank: number;
  contentId: string;
  title: string;
  hotScore: number;
  heatMetric: 'playback' | 'reading';
  status: Content['status'];
  tags: string[];
  sourceUrl: string;
  evidence: Record<string, unknown>;
  capturedAt: string;
}

export interface LeaderboardResponse {
  type: Content['type'];
  layer: LeaderboardLayerOption['id'];
  captureId: string | null;
  list: LeaderboardSnapshotItem[];
  total: number;
  stale: boolean;
}

export interface LeaderboardEvent {
  id: number;
  type: Content['type'];
  layer: LeaderboardLayerOption['id'];
  eventType: string;
  contentId: string;
  title: string;
  prevRank: number | null;
  newRank: number | null;
  rankDelta: number | null;
  prevHotScore: number | null;
  newHotScore: number | null;
  message: string;
  details: Record<string, unknown>;
  capturedAt: string;
}

export interface LeaderboardAlertsResponse {
  events: LeaderboardEvent[];
}

export interface LeaderboardAnomaly {
  code: string;
  severity: 'low' | 'medium' | 'high';
  type: Content['type'];
  layer: '' | LeaderboardLayerOption['id'];
  source: string;
  message: string;
  detail: Record<string, unknown>;
  detectedAt: string;
}

export interface LeaderboardAnomaliesResponse {
  staleThresholdMs: number;
  list: LeaderboardAnomaly[];
}

export interface LeaderboardDiffResponse {
  type: Content['type'];
  layer: LeaderboardLayerOption['id'];
  baseCaptureId: string | null;
  compareCaptureId: string | null;
  added: Array<{ contentId: string; title: string; rank: number; hotScore: number }>;
  dropped: Array<{ contentId: string; title: string; rank: number; hotScore: number }>;
  moved: Array<{
    contentId: string;
    title: string;
    prevRank: number;
    newRank: number;
    rankDelta: number;
    prevHotScore: number;
    newHotScore: number;
    hotScoreDelta: number;
  }>;
}

export interface LeaderboardTrendResponse {
  type: Content['type'];
  layer: LeaderboardLayerOption['id'];
  timeline: Array<{
    captureId: string;
    capturedAt: string;
    top: {
      contentId: string;
      title: string;
      hotScore: number;
      heatMetric: 'playback' | 'reading';
    } | null;
    listSize: number;
  } | LeaderboardSnapshotItem>;
}

export interface KeywordSubscription {
  id: number;
  keyword: string;
  type: '' | Content['type'];
  channel: string;
  target: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordSubscriptionHit {
  id: number;
  subscriptionId: number;
  captureId: string;
  keyword: string;
  type: Content['type'];
  contentId: string;
  title: string;
  matchedField: string;
  details: Record<string, unknown>;
  capturedAt: string;
}

export interface AuditLogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  requestId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ContentRevisionRecord {
  id: number;
  contentId: string;
  action: string;
  actor: string;
  before: Record<string, unknown>;
  patch: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
}
