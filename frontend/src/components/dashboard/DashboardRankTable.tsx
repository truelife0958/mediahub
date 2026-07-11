import ApiState from '../ApiState';
import { CATEGORY_TEXT } from '../../constants';
import type { Content } from '../../types';
import { formatRealMetricDisplay, getTotalScore } from '../../utils/contentMetrics';
import { buildRankItemContext, formatRankDate, getRankSourceDisplayName, sortRankItemsByRank } from '../../utils/rankBoard';

function getPlatformOriginalRank(item: Content) {
  const rank = Number(item.rankingMeta?.bestPlatformRank || item.metrics?.platformOriginalRank || item.metrics?.platformHotRank || item.metrics?.newDramaRank);
  return Number.isFinite(rank) && rank > 0 ? rank : 0;
}

interface DashboardRankTableProps {
  items: Content[];
  selectedId?: string;
  loading?: boolean;
  title: string;
  onSelect: (item: Content) => void;
  onRetry?: () => void;
  onMore?: () => void;
  compact?: boolean;
  emptyTitle?: string;
}

export default function DashboardRankTable({
  items,
  selectedId = '',
  loading = false,
  title,
  onSelect,
  onRetry,
  onMore,
  compact = false,
  emptyTitle = '暂无榜单数据',
}: DashboardRankTableProps) {
  const sortedItems = sortRankItemsByRank(items);
  const latestUpdate = sortedItems
    .map(item => item.updatedAt || item.cachedAt || item.createdAt || '')
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestUpdateText = latestUpdate ? latestUpdate.slice(0, 10) : '';
  const renderHead = (count?: number, latestUpdate?: string) => (
    <div className="dashboard-panel-head">
      <h2>{title}</h2>
      <div className="dashboard-panel-head-actions">
        {latestUpdate && <span className="dashboard-panel-updated">榜单更新于 {latestUpdate}</span>}
        {typeof count === 'number' && <span>{count} 条</span>}
        {onMore && <button type="button" className="dashboard-panel-more" onClick={onMore} aria-label={`${title} 更多`}>更多</button>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className={compact ? 'dashboard-panel is-compact' : 'dashboard-panel'}>
        {renderHead()}
        <div className="dashboard-rank-list">
          {Array.from({ length: compact ? 6 : 10 }, (_, index) => (
            <div key={index} className="dashboard-rank-row is-loading">
              <span>#{index + 1}</span>
              <span className="h-8 rounded-xl bg-[rgba(255,255,255,0.06)]" />
              {!compact && <span className="h-8 rounded-xl bg-[rgba(255,255,255,0.06)]" />}
              <span className="h-8 rounded-xl bg-[rgba(255,255,255,0.06)]" />
              <span className="h-8 rounded-xl bg-[rgba(255,255,255,0.06)]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <section className={compact ? 'dashboard-panel is-compact' : 'dashboard-panel'}>
        {renderHead()}
        <ApiState title={emptyTitle} description="当前模块没有可展示的清洁数据记录。" actionLabel="刷新数据" onAction={onRetry} />
      </section>
    );
  }

  return (
    <section className={compact ? 'dashboard-panel is-compact' : 'dashboard-panel'}>
      {renderHead(sortedItems.length, latestUpdateText)}
      <div className="dashboard-rank-head">
        <span>序号</span>
        <span>作品</span>
        {!compact && <span>核心数据</span>}
        <span>数据更新</span>
        <span>综合分</span>
      </div>
      <div className="dashboard-rank-list">
        {sortedItems.map((item, index) => {
          const context = buildRankItemContext(item);
          const score = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
          const platformHeat = Number(item.metrics?.platformHeatWan) || 0;
          const realMetric = formatRealMetricDisplay({ heatMetric: item.heatMetric, metrics: item.metrics });
          const platformRank = getPlatformOriginalRank(item);
          return (
            <button
              key={item.id}
              type="button"
              className={`dashboard-rank-row ${selectedId === item.id ? 'is-selected' : ''}`}
              aria-current={selectedId === item.id ? 'true' : undefined}
              aria-label={`查看第 ${index + 1} 条 ${item.title} 的数据详情`}
              onClick={() => onSelect(item)}
            >
              <span className="dashboard-rank-index">#{index + 1}</span>
              <span className="dashboard-rank-title">
                <strong>{item.title}</strong>
                <em>{CATEGORY_TEXT[item.type]} / {context.tags.join(' / ') || formatRankDate(item.updatedAt)}</em>
              </span>
              {!compact && (
                <span className="dashboard-rank-metrics">
                  <i>{realMetric.label} {realMetric.value}</i>
                  <i>{platformHeat > 0 ? `${Math.round(platformHeat).toLocaleString('zh-CN')} 万` : '--'}</i>
                </span>
              )}
              <span className="dashboard-rank-data">
                <strong>{formatRankDate(item.updatedAt || item.cachedAt || item.createdAt)}</strong>
                <em>{getRankSourceDisplayName(item)}</em>
                {platformRank ? <small>原始榜位 #{platformRank}</small> : null}
              </span>
              <span className="dashboard-rank-score">
                <strong>{score.toFixed(1)}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
