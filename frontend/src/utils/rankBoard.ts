import type { ContentType, HotTrendPoint } from '../types';
import type { HotMetrics } from './contentMetrics.ts';
import { getTotalScore, hasBrokenText } from './contentMetrics.ts';

export interface RankBoardItemLike {
  type: ContentType;
  title?: string;
  tags?: string[];
  actors?: string[];
  author?: string;
  ipName?: string;
  updatedAt?: string;
  cachedAt?: string;
  createdAt?: string;
  sourceLabel?: string;
  sourceProvider?: string;
  source?: {
    provider?: string;
    label?: string;
    url?: string;
  };
  hotScore?: number;
  trend?: HotTrendPoint[];
  metrics?: HotMetrics;
  rank?: number;
  hotSignals?: Array<{
    platform?: string;
    platformName?: string;
  }>;
}

export interface RankItemContext {
  tags: string[];
  facts: string[];
}

export interface RankDashboardSummary {
  boardDate: string;
  lastUpdatedAt: string;
  visibleCount: number;
  sourceCount: number;
  categoryCount: number;
  topScore: number;
  averageScore: number;
  sourceLabels: string[];
  signalLabels: string[];
}

export interface RankCountSummary {
  name: string;
  count: number;
  bestScore: number;
}

export interface RankSourceSummary extends RankCountSummary {
  share: number;
  topTitle: string;
}

export interface RankMetricAverage {
  id: 'playOrRead' | 'platformHeat' | 'searchIndex' | 'topic';
  label: string;
  score: number;
}

export interface RankInsight {
  label: string;
  value: string;
  hint: string;
}

export interface BoardDisplayTotalInput {
  apiTotal: number;
  visibleCount: number;
  selectedCategory?: string;
  selectedSource?: string;
}

const SOURCE_DISPLAY_MAP: Record<string, string> = {
  hongguo: '红果短剧',
  duanjubaike: '短剧百科',
  fanqie: '番茄小说',
  qidian: '起点中文网',
  baidu_novel: '百度小说搜索',
  bilibili: '哔哩哔哩',
  kuaikan: '快看漫画',
  tencent_comic: '腾讯动漫',
  baidu: '百度',
  weibo: '微博',
  douyin: '抖音',
  wechat: '微信',
  zhihu: '知乎',
};

function uniqueCleanText(values: Array<string | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || hasBrokenText(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function getTimeValue(value?: string) {
  const timestamp = new Date(value || '').getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function roundScore(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

function isReadingType(type?: ContentType) {
  return type === 'novel' || type === 'comic';
}

function isCastType(type?: ContentType) {
  return type === 'drama' || type === 'anime';
}

function buildCountSummary(entries: Map<string, { count: number; bestScore: number }>) {
  return [...entries.entries()]
    .map(([name, entry]) => ({ name, count: entry.count, bestScore: entry.bestScore }))
    .sort((a, b) => b.count - a.count || b.bestScore - a.bestScore || a.name.localeCompare(b.name, 'zh-CN'));
}

export function getBoardDisplayTotal({
  apiTotal,
  visibleCount,
  selectedCategory,
  selectedSource,
}: BoardDisplayTotalInput) {
  if (String(selectedCategory || selectedSource || '').trim()) return Math.max(0, visibleCount);
  return apiTotal > 0 ? apiTotal : Math.max(0, visibleCount);
}

export function formatRankDate(value?: string) {
  if (!value) return '暂无日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无日期';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function formatRankDateTime(value?: string) {
  if (!value) return '暂无更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无更新';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getContentDateValue(content: Pick<RankBoardItemLike, 'updatedAt' | 'cachedAt' | 'createdAt'>) {
  return content.updatedAt || content.cachedAt || content.createdAt || '';
}

export function getSourceDisplayName(sourceLabel?: string, sourceProvider?: string) {
  const cleanLabel = String(sourceLabel || '').trim();
  if (cleanLabel && !hasBrokenText(cleanLabel)) return cleanLabel;

  const providerKey = String(sourceProvider || '').trim().toLowerCase();
  if (providerKey in SOURCE_DISPLAY_MAP) return SOURCE_DISPLAY_MAP[providerKey];

  return providerKey || '综合榜';
}

export function getRankSourceDisplayName(item: Pick<RankBoardItemLike, 'sourceLabel' | 'sourceProvider' | 'source'>) {
  return getSourceDisplayName(item.sourceLabel || item.source?.label, item.sourceProvider || item.source?.provider);
}

export function buildTagBreakdown<T extends RankBoardItemLike>(items: T[]) {
  const counts = new Map<string, { count: number; bestScore: number }>();

  items.forEach((item) => {
    const itemScore = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
    uniqueCleanText(item.tags || []).forEach((tag) => {
      const current = counts.get(tag) || { count: 0, bestScore: 0 };
      counts.set(tag, {
        count: current.count + 1,
        bestScore: Math.max(current.bestScore, itemScore),
      });
    });
  });

  return buildCountSummary(counts);
}

export function buildCreatorBreakdown<T extends RankBoardItemLike>(items: T[]) {
  const counts = new Map<string, { count: number; bestScore: number }>();

  items.forEach((item) => {
    const itemScore = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
    const values = isCastType(item.type)
      ? uniqueCleanText(item.actors || []).slice(0, 3)
      : uniqueCleanText([item.author]);

    values.forEach((value) => {
      const current = counts.get(value) || { count: 0, bestScore: 0 };
      counts.set(value, {
        count: current.count + 1,
        bestScore: Math.max(current.bestScore, itemScore),
      });
    });
  });

  return buildCountSummary(counts);
}

export function buildIpBreakdown<T extends RankBoardItemLike>(items: T[]) {
  const counts = new Map<string, { count: number; bestScore: number }>();

  items.forEach((item) => {
    const ipName = String(item.ipName || '').trim();
    const title = String(item.title || '').trim();
    if (!ipName || hasBrokenText(ipName) || ipName === title) return;

    const itemScore = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
    const current = counts.get(ipName) || { count: 0, bestScore: 0 };
    counts.set(ipName, {
      count: current.count + 1,
      bestScore: Math.max(current.bestScore, itemScore),
    });
  });

  return buildCountSummary(counts);
}

export function buildSourceBreakdown<T extends RankBoardItemLike>(items: T[]): RankSourceSummary[] {
  const counts = new Map<string, { count: number; bestScore: number; topTitle: string }>();

  items.forEach((item) => {
    const sourceName = getRankSourceDisplayName(item);
    const itemScore = getTotalScore({ metrics: item.metrics, hotScore: item.hotScore });
    const title = String(item.title || '').trim();
    const current = counts.get(sourceName) || { count: 0, bestScore: 0, topTitle: '' };
    counts.set(sourceName, {
      count: current.count + 1,
      bestScore: Math.max(current.bestScore, itemScore),
      topTitle: itemScore >= current.bestScore ? title : current.topTitle,
    });
  });

  const total = items.length || 1;
  return [...counts.entries()]
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      bestScore: entry.bestScore,
      topTitle: entry.topTitle,
      share: Math.round((entry.count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || b.bestScore - a.bestScore || a.name.localeCompare(b.name, 'zh-CN'));
}

export function buildMetricAverages<T extends RankBoardItemLike>(items: T[]): RankMetricAverage[] {
  const total = items.length || 1;
  const metrics = [
    {
      id: 'playOrRead' as const,
      label: isReadingType(items[0]?.type) ? '阅读' : '播放',
      score: items.reduce((sum, item) => sum + (Number(item.metrics?.playOrReadScore) || 0), 0) / total,
    },
    {
      id: 'platformHeat' as const,
      label: '平台',
      score: items.reduce((sum, item) => sum + (Number(item.metrics?.platformHeatScore) || 0), 0) / total,
    },
    {
      id: 'searchIndex' as const,
      label: '热搜',
      score: items.reduce((sum, item) => sum + (Number(item.metrics?.searchIndexScore) || 0), 0) / total,
    },
    {
      id: 'topic' as const,
      label: '话题',
      score: items.reduce((sum, item) => sum + (Number(item.metrics?.topicScore) || 0), 0) / total,
    },
  ];

  return metrics.map(metric => ({ ...metric, score: roundScore(metric.score) }));
}

export function buildRankItemContext(item: Pick<RankBoardItemLike, 'type' | 'title' | 'tags' | 'actors' | 'author' | 'ipName' | 'updatedAt' | 'cachedAt' | 'createdAt'>): RankItemContext {
  const tags = uniqueCleanText(item.tags || []).slice(0, 2);
  const facts: string[] = [];

  const entityValues = isCastType(item.type)
    ? uniqueCleanText(item.actors || []).slice(0, 2)
    : uniqueCleanText([item.author]);
  if (entityValues.length > 0) {
    facts.push(`${item.type === 'drama' ? '主演' : item.type === 'anime' ? '配音' : '作者'} ${entityValues.join(' / ')}`);
  }

  const title = String(item.title || '').trim();
  const ipName = String(item.ipName || '').trim();
  if (ipName && !hasBrokenText(ipName) && ipName !== title) {
    facts.push(`IP ${ipName}`);
  }

  const dateValue = getContentDateValue(item);
  if (dateValue) {
    facts.push(`更新 ${formatRankDate(dateValue)}`);
  }

  return { tags, facts };
}

export function sortRankItemsByScore<T extends Pick<RankBoardItemLike, 'hotScore' | 'metrics' | 'updatedAt' | 'cachedAt' | 'createdAt' | 'rank'>>(items: T[]) {
  return [...items].sort((a, b) => {
    const scoreDiff = getTotalScore({ metrics: b.metrics, hotScore: b.hotScore }) - getTotalScore({ metrics: a.metrics, hotScore: a.hotScore });
    if (scoreDiff !== 0) return scoreDiff;

    const timeDiff = getTimeValue(getContentDateValue(b)) - getTimeValue(getContentDateValue(a));
    if (timeDiff !== 0) return timeDiff;

    const rankA = Number(a.rank) || Number.MAX_SAFE_INTEGER;
    const rankB = Number(b.rank) || Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export function sortRankItemsByRank<T extends Pick<RankBoardItemLike, 'hotScore' | 'metrics' | 'updatedAt' | 'cachedAt' | 'createdAt' | 'rank'>>(items: T[]) {
  return [...items].sort((a, b) => {
    const rankA = Number(a.rank) || Number.MAX_SAFE_INTEGER;
    const rankB = Number(b.rank) || Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    const scoreDiff = getTotalScore({ metrics: b.metrics, hotScore: b.hotScore }) - getTotalScore({ metrics: a.metrics, hotScore: a.hotScore });
    if (scoreDiff !== 0) return scoreDiff;

    const timeDiff = getTimeValue(getContentDateValue(b)) - getTimeValue(getContentDateValue(a));
    return timeDiff;
  });
}

export function buildRankDashboardSummary<T extends RankBoardItemLike>(items: T[]): RankDashboardSummary {
  const latestDateValue = items.reduce((max, item) => {
    const timeValue = getTimeValue(getContentDateValue(item));
    return timeValue > max ? timeValue : max;
  }, 0);

  const scores = items.map(item => getTotalScore({ metrics: item.metrics, hotScore: item.hotScore }));
  const uniqueSources = uniqueCleanText(items.map(item => getRankSourceDisplayName(item)));
  const uniqueCategories = uniqueCleanText(items.flatMap(item => item.tags || []));
  const uniqueSignals = uniqueCleanText(items.flatMap(item => (
    (item.hotSignals || []).map(signal => signal.platformName || signal.platform || '')
  )));

  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const averageScore = scores.length > 0 ? totalScore / scores.length : 0;

  return {
    boardDate: latestDateValue > 0 ? new Date(latestDateValue).toISOString() : '',
    lastUpdatedAt: latestDateValue > 0 ? new Date(latestDateValue).toISOString() : '',
    visibleCount: items.length,
    sourceCount: uniqueSources.length,
    categoryCount: uniqueCategories.length,
    topScore: scores.length > 0 ? Math.max(...scores) : 0,
    averageScore,
    sourceLabels: uniqueSources.slice(0, 6),
    signalLabels: uniqueSignals.slice(0, 6),
  };
}

export function buildDashboardHighlights<T extends RankBoardItemLike>(items: T[]): RankInsight[] {
  const sortedItems = sortRankItemsByScore(items);
  const topItem = sortedItems[0];
  const sourceBreakdown = buildSourceBreakdown(items);
  const tagBreakdown = buildTagBreakdown(items);
  const creatorBreakdown = buildCreatorBreakdown(items);

  return [
    {
      label: '热度峰值',
      value: String(topItem?.title || '暂无'),
      hint: topItem
        ? `综合 ${getTotalScore({ metrics: topItem.metrics, hotScore: topItem.hotScore }).toFixed(1)} · ${getSourceDisplayName(topItem.sourceLabel, topItem.sourceProvider)}`
        : '等待榜单数据',
    },
    {
      label: '来源主导',
      value: sourceBreakdown[0]?.name || '综合榜',
      hint: sourceBreakdown[0]
        ? `${sourceBreakdown[0].count} 部作品上榜 · 占比 ${sourceBreakdown[0].share}%`
        : '等待来源聚合',
    },
    {
      label: '热点标签',
      value: tagBreakdown[0]?.name || '暂无标签',
      hint: tagBreakdown[0]
        ? `${tagBreakdown[0].count} 部作品相关 · ${creatorBreakdown[0]?.name || '暂无人物热点'}热度领先`
        : '等待分类聚合',
    },
  ];
}
