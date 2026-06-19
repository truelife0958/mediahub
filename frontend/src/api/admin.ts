import { LONG_RUNNING_REQUEST_TIMEOUT_MS, requestJson } from './client';
import type {
  AdminLogs,
  AdminSummary,
  AiConnectionTestResult,
  AiConfig,
  AutoRefreshRuntimeStatus,
  AuditLogRecord,
  Content,
  ContentQualityStats,
  ContentRevisionRecord,
  EditableSystemSettings,
  RefreshAllContentTypesResponse,
  KeywordSubscription,
  KeywordSubscriptionHit,
  LeaderboardAnomaliesResponse,
  PaginatedResponse,
  ReferenceSettings,
  SearchAliasGroup,
  SourceHealth,
  SourceRoutingSettings,
  SourceStatus,
  SystemSettings,
} from '../types';

export async function getSourceStatuses(init?: { signal?: AbortSignal }) {
  return requestJson<SourceStatus[]>('/sources/status', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminSession() {
  return requestJson<{ authenticated: boolean }>('/admin/me');
}

export async function loginAdmin(password: string) {
  return requestJson<{ authenticated: boolean }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logoutAdmin() {
  return requestJson<{ loggedOut: boolean }>('/admin/logout', {
    method: 'POST',
  });
}

export async function getSourceHealth(params?: { type?: string }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return requestJson<SourceHealth[]>(`/sources/health${suffix}`, { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function refreshContentType(type: string) {
  return requestJson<{
    type: string;
    source: string;
    status: string;
    count: number;
    partial?: boolean;
    failedPages?: number;
    attemptedPages?: number;
    warning?: string | null;
  }>(`/ingestion/refresh?type=${encodeURIComponent(type)}`, {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function refreshAllContentTypes() {
  return requestJson<RefreshAllContentTypesResponse>('/ingestion/refresh-all', {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAiConfig(init?: { signal?: AbortSignal }) {
  return requestJson<AiConfig>('/system/ai-config', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateAiConfig(payload: {
  enabled?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  persistTarget?: 'runtime' | 'env';
}) {
  return requestJson<AiConfig>('/system/ai-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function testAiConfig(payload: {
  enabled?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}) {
  return requestJson<AiConnectionTestResult>('/system/ai-config/test', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSystemSettings(init?: { signal?: AbortSignal }) {
  return requestJson<SystemSettings>('/system/settings', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateSystemSettings(payload: EditableSystemSettings) {
  return requestJson<SystemSettings>('/system/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAutoRefreshStatus(init?: { signal?: AbortSignal }) {
  return requestJson<AutoRefreshRuntimeStatus>('/system/auto-refresh/status', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getReferenceSettings(init?: { signal?: AbortSignal }) {
  return requestJson<ReferenceSettings>('/system/reference-settings', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function updateReferenceSettings(payload: ReferenceSettings) {
  return requestJson<ReferenceSettings>('/system/reference-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSearchAliasGroups(params?: { type?: '' | Content['type']; enabled?: boolean }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.enabled !== undefined) query.set('enabled', String(params.enabled));
  return requestJson<SearchAliasGroup[]>(`/system/search-aliases${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createSearchAliasGroup(payload: {
  canonicalKeyword: string;
  aliases?: string[];
  type?: '' | Content['type'];
  enabled?: boolean;
  notes?: string;
}) {
  return requestJson<SearchAliasGroup>('/system/search-aliases', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateSearchAliasGroup(id: number, payload: Partial<{
  canonicalKeyword: string;
  aliases: string[];
  type: '' | Content['type'];
  enabled: boolean;
  notes: string;
}>) {
  return requestJson<SearchAliasGroup>(`/system/search-aliases/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function deleteSearchAliasGroup(id: number) {
  return requestJson<{ deleted: boolean; id: number }>(`/system/search-aliases/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getSourceRoutingSettings() {
  return requestJson<SourceRoutingSettings>('/system/source-routing', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function upsertSourceRouting(payload: {
  type: string;
  chain: string[];
}) {
  return requestJson<{ type: string; chain: string[] }>('/system/source-routing', {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function clearSourceRouting(type: string) {
  return requestJson<{ type: string; chain: string[] }>(`/system/source-routing/${encodeURIComponent(type)}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAdminSummary() {
  return requestJson<AdminSummary>('/system/admin-summary', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminContents(params: {
  type: Content['type'];
  page?: number;
  limit?: number;
  keyword?: string;
  sort?: 'hot' | 'latest';
}) {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page || 1),
    limit: String(params.limit || 12),
    sort: params.sort || 'latest',
    keyword: params.keyword || '',
  });
  return requestJson<PaginatedResponse<Content>>(`/system/admin-contents?${query.toString()}`, {
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateAdminContent(id: string, payload: Partial<Pick<
  Content,
  'title' | 'summary' | 'author' | 'ipName' | 'status' | 'hotScore' | 'tags' | 'actors' | 'characters'
>>) {
  return requestJson<Content>(`/system/admin-contents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createAdminContent(payload: {
  type: Content['type'];
  title: string;
  summary?: string;
  tags?: string[];
  actors?: string[];
  characters?: string[];
  author?: string;
  ipName?: string;
  status?: Content['status'];
  hotScore?: number;
  sourceUrl?: string;
}) {
  return requestJson<Content>('/system/admin-contents', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function fillMissingAdminContent(id: string) {
  return requestJson<Content>(`/system/admin-contents/${encodeURIComponent(id)}/fill-missing`, {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAdminQuality() {
  return requestJson<ContentQualityStats>('/system/admin-quality', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminLogs(limit = 50) {
  return requestJson<AdminLogs>(`/system/admin-logs?limit=${encodeURIComponent(limit)}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getLeaderboardAnomalies(params?: {
  type?: Content['type'];
  layer?: 'overall' | 'new' | 'rising' | 'completed';
}, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.layer) query.set('layer', params.layer);
  return requestJson<LeaderboardAnomaliesResponse>(`/system/leaderboard-anomalies${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function triggerLeaderboardCapture() {
  return requestJson<Array<{ type: Content['type']; captures: Array<{ layer: string; captureId: string; count: number }> }>>('/system/leaderboards/capture', {
    method: 'POST',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listKeywordSubscriptions(params?: { type?: Content['type']; enabled?: boolean }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.enabled !== undefined) query.set('enabled', String(params.enabled));
  return requestJson<{ list: KeywordSubscription[] }>(`/system/subscriptions${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function createKeywordSubscription(payload: {
  keyword: string;
  type?: '' | Content['type'];
  channel?: string;
  target?: string;
}) {
  return requestJson<KeywordSubscription>('/system/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function updateKeywordSubscription(id: number, payload: Partial<{
  keyword: string;
  type: '' | Content['type'];
  channel: string;
  target: string;
  enabled: boolean;
}>) {
  return requestJson<KeywordSubscription>(`/system/subscriptions/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function deleteKeywordSubscription(id: number) {
  return requestJson<{ deleted: boolean; id: number }>(`/system/subscriptions/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listSubscriptionHits(params?: { type?: Content['type']; keyword?: string; limit?: number }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.type) query.set('type', params.type);
  if (params?.keyword) query.set('keyword', params.keyword);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<{ list: KeywordSubscriptionHit[] }>(`/system/subscription-hits${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listAuditLogs(params?: { action?: string; entityType?: string; limit?: number }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams();
  if (params?.action) query.set('action', params.action);
  if (params?.entityType) query.set('entityType', params.entityType);
  if (params?.limit) query.set('limit', String(params.limit));
  return requestJson<{ list: AuditLogRecord[] }>(`/system/audit-logs${query.toString() ? `?${query.toString()}` : ''}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function listContentRevisions(contentId: string, limit = 50, init?: { signal?: AbortSignal }) {
  return requestJson<{ list: ContentRevisionRecord[] }>(`/system/content-revisions/${encodeURIComponent(contentId)}?limit=${encodeURIComponent(String(limit))}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}
