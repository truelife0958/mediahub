import type { HotTrendPoint } from '../../types';
import { getTrendDelta } from '../../utils/trendDelta';

interface TrendSparklineProps {
  points?: HotTrendPoint[];
  compact?: boolean;
}

function buildPath(points: HotTrendPoint[]) {
  const scores = points.map(point => Number(point.score) || 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(1, max - min);
  const width = 88;
  const height = 28;
  const xStep = points.length > 1 ? width / (points.length - 1) : width;
  return points
    .map((point, index) => {
      const x = Math.round(index * xStep * 10) / 10;
      const y = Math.round((height - ((Number(point.score) || 0) - min) / range * (height - 4) - 2) * 10) / 10;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export default function TrendSparkline({ points = [], compact = false }: TrendSparklineProps) {
  const cleanPoints = points.filter(point => Number.isFinite(Number(point.score)));
  const delta = getTrendDelta(cleanPoints);

  if (cleanPoints.length < 2) {
    return (
      <span className={`trend-sparkline ${compact ? 'is-compact' : ''} is-empty`} title="暂无连续快照趋势">
        <span className="trend-sparkline-empty">今日</span>
      </span>
    );
  }

  return (
    <span
      className={`trend-sparkline ${compact ? 'is-compact' : ''} ${delta.scoreDelta >= 0 ? 'is-up' : 'is-down'}`}
      title={`真实快照趋势：${cleanPoints[0].date} 至 ${cleanPoints[cleanPoints.length - 1].date}，${delta.label}`}
    >
      <svg viewBox="0 0 88 28" role="img" aria-label={`热度趋势 ${delta.label}`}>
        <path d={buildPath(cleanPoints)} />
      </svg>
      {!compact && <span>{delta.label}</span>}
    </span>
  );
}
