type HeatMetric = 'playback' | 'reading';

function formatReferenceValue(value?: number) {
  const normalizedValue = Math.max(0, Number(value) || 0);
  if (normalizedValue === 0) return null;

  const formatted = normalizedValue >= 10
    ? normalizedValue.toFixed(1)
    : normalizedValue.toFixed(2);
  return formatted.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatHotScore(value?: number, metric?: HeatMetric) {
  void metric;
  const formattedValue = formatReferenceValue(value);
  if (!formattedValue) return '热度参考待核验';
  return `热度参考 ${formattedValue}`;
}

export function formatHotScoreShort(value?: number, metric?: HeatMetric) {
  return formatHotScore(value, metric);
}
