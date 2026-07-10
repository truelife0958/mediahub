import { LONG_RUNNING_REQUEST_TIMEOUT_MS, requestJson } from './client';
import type {
  AdminLogs,
  AdminSummary,
  AutoRefreshRuntimeStatus,
  Content,
  ContentQualityStats,
  EnqueueRefreshAllContentTypesResponse,
  RefreshAllContentTypesResponse,
  RefreshJobQueueStatus,
  JsonDataPreview,
  JsonDataStatus,
  SourceStatus,
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
    supplementalSignals?: {
      count: number;
      errors: Array<{ platform: string; message: string }>;
    };
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


export async function getRefreshJobQueueStatus(init?: { signal?: AbortSignal }) {
  return requestJson<RefreshJobQueueStatus>('/ingestion/jobs', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function enqueueRefreshAllContentTypes(types?: Content['type'][]) {
  return requestJson<EnqueueRefreshAllContentTypesResponse>('/ingestion/refresh-all-queued', {
    method: 'POST',
    body: JSON.stringify(types?.length ? { types } : {}),
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAutoRefreshStatus(init?: { signal?: AbortSignal }) {
  return requestJson<AutoRefreshRuntimeStatus>('/system/auto-refresh/status', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getJsonDataStatus(init?: { signal?: AbortSignal }) {
  return requestJson<JsonDataStatus>('/system/json-data-status', { ...init, timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getJsonDataPreview(params: { type: Content['type']; limit?: number }, init?: { signal?: AbortSignal }) {
  const query = new URLSearchParams({
    type: params.type,
    limit: String(params.limit || 10),
  });
  return requestJson<JsonDataPreview>(`/system/json-data-preview?${query.toString()}`, {
    ...init,
    timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS,
  });
}

export async function getAdminSummary() {
  return requestJson<AdminSummary>('/system/admin-summary', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminQuality() {
  return requestJson<ContentQualityStats>('/system/admin-quality', { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}

export async function getAdminLogs(limit = 50) {
  return requestJson<AdminLogs>(`/system/admin-logs?limit=${encodeURIComponent(limit)}`, { timeoutMs: LONG_RUNNING_REQUEST_TIMEOUT_MS });
}
