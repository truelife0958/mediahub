import type { Content, SourceStatus } from '../types';

interface SourceStatusBarProps {
  type: Content['type'];
  status?: SourceStatus;
  isStale?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  onRefresh: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  tvmaze: 'TVMaze',
  openlibrary: 'Open Library',
  jikan: 'Jikan',
};

function formatDate(value?: string) {
  if (!value) return '尚未刷新';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SourceStatusBar({
  status,
  isStale,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
}: SourceStatusBarProps) {
  const isFailed = status?.status === 'failed' || Boolean(error);
  const label = status ? SOURCE_LABELS[status.source] || status.source : '公开 API';
  const statusText = isLoading
    ? '检查来源中'
    : isFailed
      ? '来源异常'
      : status
        ? '来源正常'
        : '等待刷新';

  return (
    <div className="source-status-bar">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`source-dot ${isFailed ? 'failed' : ''}`} />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
          <span className={`source-pill ${isFailed ? 'failed' : ''}`}>{statusText}</span>
          {isStale && <span className="source-pill stale">缓存数据</span>}
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {error || status?.error || `最近刷新：${formatDate(status?.finishedAt)} · ${status?.count ?? 0} 条真实内容`}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="source-refresh-button"
      >
        {isRefreshing ? '刷新中...' : '刷新来源'}
      </button>
    </div>
  );
}
