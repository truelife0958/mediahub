import type { AutoRefreshRuntimeStatus, JsonDataStatus, RefreshJob, RefreshJobQueueStatus, SourceStatus } from '../../types';
import type { ContentType } from './types';
import { TYPE_LABEL, TYPE_OPTIONS } from './types';

interface IngestionSectionProps {
  sourceMap: Map<string, SourceStatus>;
  refreshing: Record<ContentType, boolean>;
  refreshingAll?: boolean;
  ingestStage?: Record<ContentType, string>;
  autoRefreshStatus?: AutoRefreshRuntimeStatus | null;
  jsonDataStatus?: JsonDataStatus | null;
  refreshQueueStatus?: RefreshJobQueueStatus | null;
  onRefresh: (type: ContentType) => void;
  onRefreshAll: () => void;
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function getJobStatusText(status?: RefreshJob['status']) {
  const map: Record<RefreshJob['status'], string> = {
    queued: 'queued',
    running: 'running',
    success: 'success',
    partial: 'partial',
    failed: 'failed',
  };
  return status ? map[status] : '-';
}

function getCurrentJob(queue?: RefreshJobQueueStatus | null) {
  return queue?.activeJob || queue?.queuedJobs?.[0] || queue?.recentJobs?.[0] || null;
}

export default function IngestionSection({
  sourceMap,
  refreshing,
  refreshingAll = false,
  ingestStage,
  autoRefreshStatus,
  jsonDataStatus,
  refreshQueueStatus,
  onRefresh,
  onRefreshAll,
}: IngestionSectionProps) {
  const testIdByType: Record<ContentType, string> = {
    drama: 'drama',
    novel: 'novel',
    anime: 'anime',
    comic: 'comic',
  };
  const queueBusy = Boolean(refreshQueueStatus?.activeJob || refreshQueueStatus?.queueLength);
  const anyRefreshing = refreshingAll || queueBusy || TYPE_OPTIONS.some(item => refreshing[item.id]);
  const lastResults = autoRefreshStatus?.lastResults || [];
  const lastResultMap = new Map(lastResults.map(item => [item.type, item]));
  const jsonStatusMap = new Map((jsonDataStatus?.types || []).map(item => [item.type, item]));
  const queueJob = getCurrentJob(refreshQueueStatus);
  const queueResultMap = new Map((queueJob?.results || []).map(item => [item.type, item]));
  const queueProgressTotal = Math.max(1, Number(queueJob?.progress.total || 0));
  const queueProgressPercent = Math.round(((queueJob?.progress.completed || 0) / queueProgressTotal) * 100);
  const nextRunText = formatTime(autoRefreshStatus?.nextRunAt);
  const lastRunText = formatTime(autoRefreshStatus?.lastFinishedAt);
  const autoModeText = autoRefreshStatus?.mode === 'interval'
    ? `${autoRefreshStatus.intervalMinutes} min interval`
    : `${String(autoRefreshStatus?.hour ?? 0).padStart(2, '0')}:${String(autoRefreshStatus?.minute ?? 0).padStart(2, '0')} scheduled`;

  return (
    <section className="admin-panel rounded-xl p-4 mb-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">Platform data ingestion</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Public-page crawling plus local JSON fallback. Four-module refresh now runs through a persisted serial queue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={anyRefreshing}
            data-testid="admin-refresh-all-types"
            className="gold-surface rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshingAll || queueBusy ? 'Four-module queue running...' : 'Refresh four modules'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-xs text-[var(--text-muted)] md:grid-cols-4">
        <p data-testid="admin-auto-refresh-enabled">Auto refresh: <span className="text-[var(--text-primary)]">{autoRefreshStatus?.enabled ? 'enabled' : 'disabled'}</span></p>
        <p>Mode: <span className="text-[var(--text-primary)]">{autoModeText}</span></p>
        <p data-testid="admin-auto-refresh-next">Next run: <span className="text-[var(--text-primary)]">{nextRunText}</span></p>
        <p>Last done: <span className="text-[var(--text-primary)]">{lastRunText}</span></p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-xs text-[var(--text-muted)] md:grid-cols-3">
        <p>Actor index: <span className="text-[var(--text-primary)]">{jsonDataStatus?.indexes.actor ?? 0}</span></p>
        <p>IP index: <span className="text-[var(--text-primary)]">{jsonDataStatus?.indexes.ip ?? 0}</span></p>
        <p>Category index: <span className="text-[var(--text-primary)]">{jsonDataStatus?.indexes.category ?? 0}</span></p>
      </div>

      {queueJob && (
        <div className="mb-4 rounded-xl border border-[rgba(232,168,56,0.22)] bg-[rgba(232,168,56,0.08)] p-3 text-xs text-[var(--text-muted)]" data-testid="admin-refresh-queue-status">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-[var(--text-primary)]">Queue job: {getJobStatusText(queueJob.status)} - {queueJob.progress.completed}/{queueJob.progress.total}</p>
              <p>Current: <span className="text-[var(--text-primary)]">{queueJob.currentType ? TYPE_LABEL[queueJob.currentType as ContentType] || queueJob.currentType : '-'}</span> - failed {queueJob.progress.failed} - waiting {refreshQueueStatus?.queueLength ?? 0}</p>
            </div>
            <p className="text-[11px]">Updated: {formatTime(queueJob.updatedAt)}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
            <div className="h-full rounded-full bg-[var(--accent-primary)] transition-all" style={{ width: `${queueProgressPercent}%` }} />
          </div>
          {queueJob.error && <p className="mt-2 text-[#f87171]">Error: {queueJob.error}</p>}
          {refreshQueueStatus?.persistError && <p className="mt-2 text-[#f87171]">Queue persistence error: {refreshQueueStatus.persistError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TYPE_OPTIONS.map(item => {
          const status = sourceMap.get(item.id);
          const runtimeResult = lastResultMap.get(item.id);
          const queueResult = queueResultMap.get(item.id);
          const jsonStatus = jsonStatusMap.get(item.id);
          const count = jsonStatus?.count ?? queueResult?.count ?? runtimeResult?.count ?? status?.count ?? 0;
          const hasError = queueResult?.status === 'failed' || runtimeResult?.status === 'failed' || Boolean(status?.error);
          const inQueuedJob = Boolean(queueJob?.types.includes(item.id));
          const stage = queueJob?.currentType === item.id
            ? 'collecting'
            : queueResult?.status === 'success'
              ? 'done'
              : queueResult?.status === 'failed'
                ? 'failed'
                : inQueuedJob && queueBusy
                  ? 'queued'
                  : (ingestStage?.[item.id] || (refreshing[item.id] ? 'requesting' : 'idle'));
          const updatedText = jsonStatus?.capturedAt
            ? new Date(jsonStatus.capturedAt).toLocaleString('zh-CN')
            : (status?.finishedAt ? new Date(status.finishedAt).toLocaleString('zh-CN') : '-');
          const progressWidth = refreshing[item.id] || (queueBusy && inQueuedJob)
            ? (queueResult ? '100%' : queueJob?.currentType === item.id ? '62%' : '28%')
            : stage === 'done' ? '100%' : hasError ? '28%' : '12%';
          return (
            <div key={item.id} className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--border)]/80">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-[var(--text-primary)]">{item.label}</strong>
                <button
                  onClick={() => onRefresh(item.id)}
                  disabled={refreshing[item.id] || queueBusy}
                  data-testid={`admin-manual-refresh-${testIdByType[item.id]}`}
                  className="control-button px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {refreshing[item.id] ? 'Collecting...' : `Refresh ${TYPE_LABEL[item.id]}`}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-status-${testIdByType[item.id]}`}>
                Status: {queueResult?.status || runtimeResult?.status || status?.status || 'no record'}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-count-${testIdByType[item.id]}`}>
                Count: {count}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-provider-${testIdByType[item.id]}`}>
                Source: {status?.source || 'json_hot_dataset'}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-updated-${testIdByType[item.id]}`}>
                Updated: {updatedText}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Dataset date: {jsonStatus?.date || '-'}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
                  style={{ width: progressWidth }}
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]" data-testid={`admin-source-stage-${testIdByType[item.id]}`}>
                Stage: {stage}
              </p>
              {(queueResult?.error || runtimeResult?.error || status?.error) && (
                <p className="text-xs text-[#f87171] mt-1" data-testid={`admin-source-error-${testIdByType[item.id]}`}>
                  Error: {queueResult?.error || runtimeResult?.error || status?.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
