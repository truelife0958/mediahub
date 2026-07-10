import type { Content } from '../../types';
import { formatMetricScore, formatRealMetricDisplay, formatYiMetric, getTotalScore } from '../../utils/contentMetrics';

interface MetricQuadProps {
  content: Content;
  compact?: boolean;
}

function formatWholeNumber(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  return Math.round(numeric).toLocaleString('zh-CN');
}

function formatWan(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  return `${Math.round(numeric).toLocaleString('zh-CN')} 万`;
}

export default function MetricQuad({ content, compact = false }: MetricQuadProps) {
  const metrics = content.metrics || {};
  const realMetric = formatRealMetricDisplay({ heatMetric: content.heatMetric, metrics });
  const rows = [
    { id: 'contentIndex', label: realMetric.label, value: realMetric.value, score: Number(metrics.playOrReadScore) || 0 },
    { id: 'platformIndex', label: '平台指数', value: formatWan(metrics.platformHeatWan), score: Number(metrics.platformHeatScore) || 0 },
    { id: 'searchIndex', label: '搜索指数', value: formatWholeNumber(metrics.searchIndex), score: Number(metrics.searchIndexScore) || 0 },
    { id: 'topicSpread', label: '话题播放', value: formatYiMetric(metrics.topicPlayYi), score: Number(metrics.topicScore) || 0 },
  ];

  return (
    <div className={compact ? 'metric-quad is-compact' : 'metric-quad'}>
      {rows.map(row => (
        <div key={row.id} className="metric-quad-item">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <i><b style={{ width: `${Math.min(100, Math.max(0, row.score))}%` }} /></i>
          <em>{formatMetricScore(row.score)}</em>
        </div>
      ))}
      <div className="metric-quad-total">
        <span>综合分</span>
        <strong>{getTotalScore({ metrics, hotScore: content.hotScore }).toFixed(1)}</strong>
      </div>
    </div>
  );
}
