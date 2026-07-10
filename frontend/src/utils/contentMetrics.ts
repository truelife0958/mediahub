type HeatMetric = 'playback' | 'reading';

export interface HotMetrics {
  realPlayCount?: number;
  realReadCount?: number;
  realMetricStatus?: 'official' | 'trusted_third_party' | 'unavailable';
  realMetricCapturedAt?: string;
  realMetricSources?: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    metricType: 'play' | 'read';
    value: number;
    unit: 'count';
    method: 'public_page' | 'embedded_json' | 'public_api' | 'third_party';
    confidence: 'official' | 'trusted_third_party';
    capturedAt: string;
  }>;
  playOrReadYi?: number;
  platformHeatWan?: number;
  likesWan?: number;
  favoritesWan?: number;
  searchIndex?: number;
  topicPlayYi?: number;
  platformHotRank?: number;
  newDramaRank?: number;
  playOrReadScore?: number;
  platformHeatScore?: number;
  searchIndexScore?: number;
  topicScore?: number;
  sourceSignalScore?: number;
  totalScore?: number;
}

export interface MetricRow {
  id: 'playOrRead' | 'platformHeat' | 'searchIndex' | 'topic' | 'sourceSignal';
  label: string;
  score: number;
}

const BROKEN_TEXT_RE = /�|锟|閿|閸|濮|娑|鈹|鐭|鍐|鐑|绔|澶|彂|簱|灏忚|婕|鍔ㄦ|姒滆|鎼滅|鏆傛|鎾|闃呰|绠＄悊|缁煎|绾㈡|鐭|璁镐|笀鍏|浣欒|椹|鐪熷|濞变|闇告|钀屽|瀹佸|鐢ㄦ/;

function clampScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function hasBrokenText(value: unknown) {
  return BROKEN_TEXT_RE.test(String(value || ''));
}

export function getTotalScore({
  metrics,
  hotScore,
}: {
  metrics?: HotMetrics;
  hotScore?: number;
}) {
  const metricScore = Number(metrics?.totalScore);
  if (Number.isFinite(metricScore)) return Math.max(0, Math.min(100, metricScore));
  return Math.max(0, Math.min(100, (Number(hotScore) || 0) / 10000));
}


function formatCount(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '未公开';
  if (numeric >= 100_000_000) {
    return `${(numeric / 100_000_000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}亿`;
  }
  if (numeric >= 10_000) {
    return `${(numeric / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return Math.round(numeric).toLocaleString('zh-CN');
}

function formatCapturedDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function formatRealMetricDisplay({
  heatMetric = 'playback',
  metrics,
}: {
  heatMetric?: HeatMetric;
  metrics?: HotMetrics;
}) {
  const metricType = heatMetric === 'reading' ? 'read' : 'play';
  const count = metricType === 'read' ? metrics?.realReadCount : metrics?.realPlayCount;
  const status = metrics?.realMetricStatus === 'trusted_third_party' && Number(count) > 0
    ? 'trusted_third_party'
    : (metrics?.realMetricStatus === 'official' && Number(count) > 0 ? 'official' : 'unavailable');
  const baseLabel = metricType === 'read' ? '阅读量' : '播放量';
  const label = status === 'trusted_third_party' ? `第三方${baseLabel}` : `真实${baseLabel}`;
  const source = metrics?.realMetricSources?.find(item => item.metricType === metricType && item.value === count)
    || metrics?.realMetricSources?.find(item => item.metricType === metricType);
  const date = formatCapturedDate(metrics?.realMetricCapturedAt || source?.capturedAt);
  return {
    label,
    value: status === 'unavailable' ? '未公开' : formatCount(count),
    meta: status === 'unavailable'
      ? '真实数据未公开'
      : `来源：${source?.sourceName || '公开来源'}${date ? ` · 采集：${date}` : ''}`,
    status,
  };
}

export function buildMetricRows({
  metrics,
}: {
  heatMetric?: HeatMetric;
  metrics?: HotMetrics;
  hotScore?: number;
}): MetricRow[] {
  const rows: MetricRow[] = [
    {
      id: 'playOrRead',
      label: '内容',
      score: clampScore(metrics?.playOrReadScore),
    },
    {
      id: 'platformHeat',
      label: '平台',
      score: clampScore(metrics?.platformHeatScore),
    },
    {
      id: 'searchIndex',
      label: '热搜',
      score: clampScore(metrics?.searchIndexScore),
    },
    {
      id: 'topic',
      label: '话题',
      score: clampScore(metrics?.topicScore),
    },
  ];
  const sourceSignalScore = clampScore(metrics?.sourceSignalScore);
  if (sourceSignalScore > 0) {
    rows.push({
      id: 'sourceSignal',
      label: '来源',
      score: sourceSignalScore,
    });
  }
  return rows;
}

export function formatYiMetric(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  const fixed = numeric >= 10 ? numeric.toFixed(1) : numeric.toFixed(2);
  return `${fixed.replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.00$/, '.0')} 亿`;
}

export function formatMetricScore(value: number) {
  return String(clampScore(value));
}
