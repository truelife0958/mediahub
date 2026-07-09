import ApiState from '../ApiState';
import { CATEGORY_TEXT } from '../../constants';
import type { Content } from '../../types';
import { formatYiMetric, getTotalScore } from '../../utils/contentMetrics';
import { buildRankItemContext, formatRankDate, getRankSourceDisplayName, sortRankItemsByScore } from '../../utils/rankBoard';
import TrendSparkline from './TrendSparkline';

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高可信',
  medium: '中可信',
  low: '低可信',
};

function getRankingConfidence(item: Content) {
  return item.rankingMeta?.sourceConfidence || 'medium';
}

function getPlatformOriginalRank(item: Content) {
  const rank = Number(item.rankingMeta?.bestPlatformRank || item.metrics?.platformOriginalRank || item.metrics?.platformHotRank || item.metrics?.newDramaRank);
  return Number.isFinite(rank) && rank > 0 ? rank : 0;
}

function getRankingReason(item: Content) {
  return item.rankingMeta?.rankingReason || '综合真实来源、平台热度与搜索话题信号排序';
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
  const sortedItems = sortRankItemsByScore(items);
  const renderHead = (count?: number) => (
    <div className="dashboard-panel-head">
      <h2>{title}</h2>
      <div className="dashboard-panel-head-actions">
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
              <span />
              <span />
              <span />
              <span />
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
        <ApiState title={emptyTitle} description="当前模块没有可展示的清洁榜单记录。" actionLabel="刷新榜单" onAction={onRetry} />
      </section>
    );
  }

  return (
    <section className={compact ? 'dashboard-panel is-compact' : 'dashboard-panel'}>
      {renderHead(sortedItems.length)}
      <div className="dashboard-rank-head">
        <span>排名</span>
        <span>作品</span>
        {!compact && <span>指标</span>}
        <span>来源可信度</span>
        <span>综合分</span>
      </div>
      <div className="dashboard-rank-list">
        {sortedItems.map((item, index) => {
          const context = buildRankItemContext(item);
          const score = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
          const platformHeat = Number(item.metrics?.platformHeatWan) || 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`dashboard-rank-row ${selectedId === item.id ? 'is-selected' : ''}`}
              aria-current={selectedId === item.id ? 'true' : undefined}
              aria-label={`查看第 ${index + 1} 名 ${item.title} 的榜单详情`}
              onClick={() => onSelect(item)}
            >
              <span className={`dashboard-rank-index ${index < 3 ? 'is-top' : ''}`}>#{index + 1}</span>
              <span className="dashboard-rank-title">
                <strong>{item.title}</strong>
                <em>{CATEGORY_TEXT[item.type]} / {context.tags.join(' / ') || formatRankDate(item.updatedAt)}</em>
              </span>
              {!compact && (
                <span className="dashboard-rank-metrics">
                  <i>{formatYiMetric(item.metrics?.playOrReadYi)}</i>
                  <i>{platformHeat > 0 ? `${Math.round(platformHeat).toLocaleString('zh-CN')} 万` : '--'}</i>
                </span>
              )}
              <span className="dashboard-rank-source">
                <strong>{getRankSourceDisplayName(item)}</strong>
                <span className="ranking-source-row">
                  <span className={`ranking-confidence-badge is-${getRankingConfidence(item)}`}>{CONFIDENCE_LABEL[getRankingConfidence(item)]}</span>
                  <em>{getPlatformOriginalRank(item) ? `平台原榜 #${getPlatformOriginalRank(item)}` : (item.source?.url ? '真实来源 · 可追溯' : '真实来源')}</em>
                </span>
                <small className="ranking-reason">{getRankingReason(item)}</small>
              </span>
              <span className="dashboard-rank-score">
                <strong>{score.toFixed(1)}</strong>
                <TrendSparkline points={item.trend} compact={compact} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
