import type { AutoRefreshRuntimeStatus, SourceStatus } from '../../types';
import type { ContentType } from './types';
import { TYPE_LABEL, TYPE_OPTIONS } from './types';

interface IngestionSectionProps {
  sourceMap: Map<string, SourceStatus>;
  refreshing: Record<ContentType, boolean>;
  refreshingAll?: boolean;
  savingAutoRefresh?: boolean;
  ingestStage?: Record<ContentType, string>;
  autoRefreshStatus?: AutoRefreshRuntimeStatus | null;
  onRefresh: (type: ContentType) => void;
  onRefreshAll: () => void;
  onEnableAutoRefresh: () => void;
}

export default function IngestionSection({
  sourceMap,
  refreshing,
  refreshingAll = false,
  savingAutoRefresh = false,
  ingestStage,
  autoRefreshStatus,
  onRefresh,
  onRefreshAll,
  onEnableAutoRefresh,
}: IngestionSectionProps) {
  const testIdByType: Record<ContentType, string> = {
    drama: 'drama',
    novel: 'novel',
    comic: 'comic',
    anime: 'anime',
  };
  const anyRefreshing = refreshingAll || TYPE_OPTIONS.some(item => refreshing[item.id]);
  const lastResults = autoRefreshStatus?.lastResults || [];
  const lastResultMap = new Map(lastResults.map(item => [item.type, item]));
  const nextRunText = autoRefreshStatus?.nextRunAt ? new Date(autoRefreshStatus.nextRunAt).toLocaleString('zh-CN') : '-';
  const lastRunText = autoRefreshStatus?.lastFinishedAt ? new Date(autoRefreshStatus.lastFinishedAt).toLocaleString('zh-CN') : '-';
  const autoModeText = autoRefreshStatus?.mode === 'interval'
    ? `${autoRefreshStatus.intervalMinutes} 分钟间隔`
    : `${String(autoRefreshStatus?.hour ?? 0).padStart(2, '0')}:${String(autoRefreshStatus?.minute ?? 0).padStart(2, '0')} 定时`;

  return (
    <section className="admin-panel rounded-xl p-4 mb-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">AI 热门检索入库</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">短剧、小说、漫画、动漫独立刷新入库；热度统一按播放量/阅读量展示。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEnableAutoRefresh}
            disabled={savingAutoRefresh || Boolean(autoRefreshStatus?.enabled)}
            data-testid="admin-enable-auto-refresh"
            className="control-button rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {autoRefreshStatus?.enabled ? '自动更新已开启' : savingAutoRefresh ? '保存中...' : '开启自动更新'}
          </button>
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={anyRefreshing}
            data-testid="admin-refresh-all-types"
            className="gold-surface rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshingAll ? '四类更新中...' : '一键 AI 更新四类'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-xs text-[var(--text-muted)] md:grid-cols-4">
        <p data-testid="admin-auto-refresh-enabled">自动更新：<span className="text-[var(--text-primary)]">{autoRefreshStatus?.enabled ? '已开启' : '未开启'}</span></p>
        <p>策略：<span className="text-[var(--text-primary)]">{autoModeText}</span></p>
        <p data-testid="admin-auto-refresh-next">下次执行：<span className="text-[var(--text-primary)]">{nextRunText}</span></p>
        <p>最近完成：<span className="text-[var(--text-primary)]">{lastRunText}</span></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TYPE_OPTIONS.map(item => {
          const status = sourceMap.get(item.id);
          const runtimeResult = lastResultMap.get(item.id);
          const count = runtimeResult?.count ?? status?.count ?? 0;
          const hasError = runtimeResult?.status === 'failed' || Boolean(status?.error);
          return (
            <div key={item.id} className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--border)]/80">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-[var(--text-primary)]">{item.label}</strong>
                <button
                  onClick={() => onRefresh(item.id)}
                  disabled={refreshing[item.id]}
                  data-testid={`admin-manual-refresh-${testIdByType[item.id]}`}
                  className="control-button px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {refreshing[item.id] ? '刷新中...' : `更新${TYPE_LABEL[item.id]}`}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-status-${testIdByType[item.id]}`}>
                状态：{runtimeResult?.status || status?.status || '暂无记录'}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-count-${testIdByType[item.id]}`}>
                条数：{count}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-provider-${testIdByType[item.id]}`}>
                来源：{status?.source || '-'}
              </p>
              <p
                className="text-xs text-[var(--text-muted)]"
                data-testid={`admin-source-updated-${testIdByType[item.id]}`}
              >
                更新时间：{status?.finishedAt ? new Date(status.finishedAt).toLocaleString('zh-CN') : '-'}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
                  style={{ width: refreshing[item.id] ? '62%' : ingestStage?.[item.id] === '完成' ? '100%' : hasError ? '28%' : '12%' }}
                />
              </div>
              <p
                className="mt-1 text-[11px] text-[var(--text-muted)]"
                data-testid={`admin-source-stage-${testIdByType[item.id]}`}
              >
                阶段：{ingestStage?.[item.id] || (refreshing[item.id] ? '请求中' : '待执行')}
              </p>
              {(runtimeResult?.error || status?.error) && (
                <p
                  className="text-xs text-[#f87171] mt-1"
                  data-testid={`admin-source-error-${testIdByType[item.id]}`}
                >
                  错误：{runtimeResult?.error || status?.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
