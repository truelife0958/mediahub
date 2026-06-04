type HeatMetric = 'playback' | 'reading';

function labelByMetric(metric?: HeatMetric) {
  return metric === 'reading' ? '全网阅读量' : '全网播放量';
}

export function formatHotScore(value: number, metric?: HeatMetric) {
  const normalizedValue = Math.max(0, Math.round(Number(value) || 0));
  const label = labelByMetric(metric);
  if (normalizedValue === 0) return `${label}待披露`;
  return `${label} ${normalizedValue.toLocaleString('zh-CN')} 万次`;
}

export function formatHotScoreShort(value: number, metric?: HeatMetric) {
  const normalizedValue = Math.max(0, Math.round(Number(value) || 0));
  const label = metric === 'reading' ? '阅读量' : '播放量';
  if (normalizedValue === 0) return `${label}待披露`;
  return `${label} ${normalizedValue.toLocaleString('zh-CN')} 万次`;
}
