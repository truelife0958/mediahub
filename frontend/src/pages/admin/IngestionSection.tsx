import type { SourceStatus } from '../../types';
import type { ContentType } from './types';
import { TYPE_OPTIONS } from './types';

interface IngestionSectionProps {
  sourceMap: Map<string, SourceStatus>;
  refreshing: Record<ContentType, boolean>;
  ingestStage?: Record<ContentType, string>;
  onRefresh: (type: ContentType) => void;
}

export default function IngestionSection({
  sourceMap,
  refreshing,
  ingestStage,
  onRefresh,
}: IngestionSectionProps) {
  const testIdByType: Record<ContentType, string> = {
    drama: 'drama',
    novel: 'novel',
    comic: 'comic',
    anime: 'anime',
  };

  return (
    <section className="admin-panel rounded-xl p-4 mb-6">
      <div className="mb-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em]">AI 热门检索入库</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">仅通过 AI 模型抓取和整理数据，不再依赖平台 API 源。</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TYPE_OPTIONS.map(item => {
          const status = sourceMap.get(item.id);
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
                  {refreshing[item.id] ? '刷新中...' : '手动获取/入库'}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-status-${testIdByType[item.id]}`}>
                状态：{status?.status || '暂无记录'}
              </p>
              <p className="text-xs text-[var(--text-muted)]" data-testid={`admin-source-count-${testIdByType[item.id]}`}>
                条数：{status?.count ?? 0}
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
                  style={{ width: refreshing[item.id] ? '62%' : ingestStage?.[item.id] === '完成' ? '100%' : '12%' }}
                />
              </div>
              <p
                className="mt-1 text-[11px] text-[var(--text-muted)]"
                data-testid={`admin-source-stage-${testIdByType[item.id]}`}
              >
                阶段：{ingestStage?.[item.id] || (refreshing[item.id] ? '请求中' : '待执行')}
              </p>
              {status?.error && (
                <p
                  className="text-xs text-[#f87171] mt-1"
                  data-testid={`admin-source-error-${testIdByType[item.id]}`}
                >
                  错误：{status.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
