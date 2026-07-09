import ApiState from './ApiState';
import { CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';
import { buildMetricRows, formatMetricScore, getTotalScore, type HotMetrics } from '../utils/contentMetrics';
import TrendSparkline from './dashboard/TrendSparkline';
import { formatHotScoreShort } from '../utils/hotScore';
import {
  buildRankItemContext,
  formatRankDate,
  getRankSourceDisplayName,
  sortRankItemsByScore,
  type RankBoardItemLike,
} from '../utils/rankBoard';

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高可信',
  medium: '中可信',
  low: '低可信',
};

function getRankingConfidence(item: Pick<Content, 'rankingMeta'>) {
  return item.rankingMeta?.sourceConfidence || 'medium';
}

function getPlatformOriginalRank(item: Pick<Content, 'rankingMeta' | 'metrics'>) {
  const rank = Number(item.rankingMeta?.bestPlatformRank || item.metrics?.platformOriginalRank || item.metrics?.platformHotRank || item.metrics?.newDramaRank);
  return Number.isFinite(rank) && rank > 0 ? rank : 0;
}

function getRankingReason(item: Pick<Content, 'rankingMeta'>) {
  return item.rankingMeta?.rankingReason || '综合真实来源、平台热度与搜索话题信号排序';
}

export interface RankListItem extends RankBoardItemLike {
  id: string;
  title: string;
  type: Content['type'];
  status?: Content['status'];
  summary?: string;
  heatMetric?: 'playback' | 'reading';
  sourceUrl?: string;
  metrics?: HotMetrics;
  rankingEvidence?: Content['rankingEvidence'];
  rankingMeta?: Content['rankingMeta'];
}

interface PlatformRankListProps {
  items: RankListItem[];
  loading?: boolean;
  onItemClick: (item: RankListItem) => void;
  emptyTitle: string;
  emptyDesc: string;
  onRetry?: () => void;
  loadingCount?: number;
}

export default function PlatformRankList({
  items,
  loading = false,
  onItemClick,
  emptyTitle,
  emptyDesc,
  onRetry,
  loadingCount = 10,
}: PlatformRankListProps) {
  const visibleItems = sortRankItemsByScore(items);

  return (
    <>
      <div className="rank-blend-note">
        <span>综合热榜</span>
        <strong>播放/阅读 40% · 平台热度 30% · 热搜指数 20% · 话题度 10%</strong>
      </div>

      {loading ? (
        <div className="rank-table-shell">
          <div className="rank-table-head">
            <span>排名</span>
            <span>作品</span>
            <span>四项指标</span>
            <span>来源可信度</span>
            <span>综合分</span>
          </div>
          <div className="rank-table-body">
            {Array.from({ length: loadingCount }, (_, index) => (
              <div key={index} className="rank-table-row is-loading">
                <span className="rank-table-index">#{index + 1}</span>
                <span className="h-11 rounded-xl bg-[rgba(255,255,255,0.06)]" />
                <span className="h-11 rounded-xl bg-[rgba(255,255,255,0.06)]" />
                <span className="h-11 rounded-xl bg-[rgba(255,255,255,0.06)]" />
                <span className="h-11 rounded-xl bg-[rgba(255,255,255,0.06)]" />
              </div>
            ))}
          </div>
        </div>
      ) : visibleItems.length > 0 ? (
        <div className="rank-table-shell">
          <div className="rank-table-head">
            <span>排名</span>
            <span>作品</span>
            <span>四项指标</span>
            <span>来源可信度</span>
            <span>综合分</span>
          </div>
          <div className="rank-table-body">
            {visibleItems.map((item, index) => {
              const metricRows = buildMetricRows({
                heatMetric: item.heatMetric,
                metrics: item.metrics,
                hotScore: item.hotScore,
              });
              const totalScore = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
              const context = buildRankItemContext(item);
              const sourceName = getRankSourceDisplayName(item);
              const metaParts = [
                CATEGORY_TEXT[item.type],
                item.status === 'ongoing' ? '连载中' : '已完结',
                ...context.facts,
              ];

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="rank-table-row"
                >
                  <span className={`rank-table-index ${index < 3 ? 'is-hot' : ''}`}>#{index + 1}</span>

                  <span className="rank-table-main">
                    <span className="rank-table-title-row">
                      {index < 3 && <span className="rank-table-top-tag">TOP</span>}
                      <span className="rank-table-title">{item.title}</span>
                    </span>
                    {context.tags.length > 0 && (
                      <span className="rank-table-tag-row">
                        {context.tags.map(tag => (
                          <span key={tag} className="rank-table-tag">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="rank-table-meta">{metaParts.join(' · ')}</span>
                  </span>

                  <span className="rank-metric-strip" aria-label="四项指标热度">
                    {metricRows.map(row => (
                      <span key={row.id} className="rank-metric-pill">
                        <span className="rank-metric-label">{row.label}</span>
                        <span className="rank-metric-track">
                          <span style={{ width: `${row.score}%` }} />
                        </span>
                        <span className="rank-metric-value">{formatMetricScore(row.score)}</span>
                      </span>
                    ))}
                  </span>

                  <span className="rank-table-source">
                    <strong>{sourceName}</strong>
                    <span className="ranking-source-row">
                      <span className={`ranking-confidence-badge is-${getRankingConfidence(item)}`}>{CONFIDENCE_LABEL[getRankingConfidence(item)]}</span>
                      <em>{getPlatformOriginalRank(item) ? `平台原榜 #${getPlatformOriginalRank(item)}` : (item.source?.url ? '真实来源 · 可追溯' : '真实来源')}</em>
                    </span>
                    <small className="ranking-reason">{getRankingReason(item)}</small>
                  </span>
                  <span className="rank-table-score">
                    <strong>{totalScore.toFixed(1)}</strong>
                    <TrendSparkline points={item.trend} compact />
                    <span>{formatHotScoreShort(item.metrics?.playOrReadYi, item.heatMetric)}</span>
                    <em>更新 {formatRankDate(item.updatedAt)}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <ApiState
          title={emptyTitle}
          description={emptyDesc}
          actionLabel="刷新榜单"
          onAction={onRetry}
        />
      )}
    </>
  );
}
