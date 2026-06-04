import type { SystemSettings } from '../../types';

export interface SystemSettingsFormState {
  autoRefreshEnabled: boolean;
  autoRefreshRunOnStartup: boolean;
  autoRefreshMode: 'daily' | 'interval';
  intervalMinutes: string;
  failureBackoffEnabled: boolean;
  failureBackoffMultiplier: string;
  failureBackoffMaxMinutes: string;
  hour: string;
  minute: string;
  pages: string;
  pageSize: string;
  sortHot: boolean;
  sortLatest: boolean;
  ttlMs: string;
  timeoutMs: string;
  retryMaxAttempts: string;
  retryBaseDelayMs: string;
  circuitBreakerFailureThreshold: string;
  circuitBreakerOpenMs: string;
  rateLimitPerSecond: string;
  rateLimitBurst: string;
  webhookEnabled: boolean;
  webhookTimeoutMs: string;
  webhookRetryMaxAttempts: string;
  webhookRetryBaseDelayMs: string;
}

export function createSystemSettingsFormState(settings: SystemSettings | null): SystemSettingsFormState {
  return {
    autoRefreshEnabled: Boolean(settings?.autoRefresh.enabled),
    autoRefreshRunOnStartup: Boolean(settings?.autoRefresh.runOnStartup),
    autoRefreshMode: settings?.autoRefresh.mode === 'interval' ? 'interval' : 'daily',
    intervalMinutes: String(settings?.autoRefresh.intervalMinutes ?? 10),
    failureBackoffEnabled: Boolean(settings?.autoRefresh.failureBackoffEnabled ?? true),
    failureBackoffMultiplier: String(settings?.autoRefresh.failureBackoffMultiplier ?? 2),
    failureBackoffMaxMinutes: String(settings?.autoRefresh.failureBackoffMaxMinutes ?? 60),
    hour: String(settings?.autoRefresh.hour ?? 0),
    minute: String(settings?.autoRefresh.minute ?? 0),
    pages: String(settings?.ingestBackfill.pages ?? 1),
    pageSize: String(settings?.ingestBackfill.pageSize ?? 1),
    sortHot: Boolean(settings?.ingestBackfill.sorts?.includes('hot')),
    sortLatest: Boolean(settings?.ingestBackfill.sorts?.includes('latest')),
    ttlMs: String(settings?.cache.ttlMs ?? 15000),
    timeoutMs: String(settings?.cache.timeoutMs ?? 2000),
    retryMaxAttempts: String(settings?.cache.retryMaxAttempts ?? 2),
    retryBaseDelayMs: String(settings?.cache.retryBaseDelayMs ?? 300),
    circuitBreakerFailureThreshold: String(settings?.cache.circuitBreakerFailureThreshold ?? 5),
    circuitBreakerOpenMs: String(settings?.cache.circuitBreakerOpenMs ?? 30000),
    rateLimitPerSecond: String(settings?.cache.rateLimitPerSecond ?? 6),
    rateLimitBurst: String(settings?.cache.rateLimitBurst ?? 6),
    webhookEnabled: Boolean(settings?.notifications?.webhookEnabled ?? false),
    webhookTimeoutMs: String(settings?.notifications?.webhookTimeoutMs ?? 5000),
    webhookRetryMaxAttempts: String(settings?.notifications?.webhookRetryMaxAttempts ?? 3),
    webhookRetryBaseDelayMs: String(settings?.notifications?.webhookRetryBaseDelayMs ?? 500),
  };
}

export function serializeSystemSettingsFormState(form: SystemSettingsFormState) {
  return JSON.stringify(form);
}
