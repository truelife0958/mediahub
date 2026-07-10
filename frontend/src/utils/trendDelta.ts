import type { HotTrendPoint } from '../types';

export function getTrendDelta(points: HotTrendPoint[] = []) {
  const cleanPoints = points.filter(point => Number.isFinite(Number(point.score)));
  if (cleanPoints.length < 2) return { scoreDelta: 0, rankDelta: 0, label: '???' };

  const first = cleanPoints[0];
  const last = cleanPoints[cleanPoints.length - 1];
  const scoreDelta = Math.round(((Number(last.score) || 0) - (Number(first.score) || 0)) * 10) / 10;
  const rankDelta = (Number(first.rank) || 0) - (Number(last.rank) || 0);
  const scoreLabel = scoreDelta > 0 ? `+${scoreDelta.toFixed(1)}` : scoreDelta < 0 ? scoreDelta.toFixed(1) : '??';
  const rankLabel = rankDelta > 0 ? `?${rankDelta}` : rankDelta < 0 ? `?${Math.abs(rankDelta)}` : '????';

  return { scoreDelta, rankDelta, label: `${scoreLabel} ? ${rankLabel}` };
}
