import { CATEGORY_TEXT } from '../../constants';
import type { Content } from '../../types';
import { getTotalScore } from '../../utils/contentMetrics';
import { getRankSourceDisplayName, sortRankItemsByScore } from '../../utils/rankBoard';
import { getTrendDelta } from '../../utils/trendDelta';

interface TodayChangesPanelProps {
  items: Content[];
}

function formatSigned(value: number, suffix = '') {
  if (!Number.isFinite(value)) return `0.0${suffix}`;
  if (value === 0) return `0.0${suffix}`;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
}

function itemHasTrend(item: Content) {
  return Array.isArray(item.trend) && item.trend.length >= 2;
}

export default function TodayChangesPanel({ items }: TodayChangesPanelProps) {
  const visibleItems = sortRankItemsByScore(items).slice(0, 48);
  const trendItems = visibleItems
    .map(item => ({ item, delta: getTrendDelta(item.trend) }))
    .filter(entry => itemHasTrend(entry.item));
  const topRiser = [...trendItems].sort((a, b) => b.delta.scoreDelta - a.delta.scoreDelta)[0];
  const rankRiser = [...trendItems].sort((a, b) => b.delta.rankDelta - a.delta.rankDelta)[0];
  const latest = [...visibleItems].sort((a, b) => Date.parse(b.updatedAt || b.cachedAt || '') - Date.parse(a.updatedAt || a.cachedAt || ''))[0];
  const sourceCounts = new Map<string, number>();
  visibleItems.forEach((item) => {
    const sourceName = getRankSourceDisplayName(item);
    sourceCounts.set(sourceName, (sourceCounts.get(sourceName) || 0) + 1);
  });
  const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))[0];

  const cards = [
    {
      label: '热度上升',
      value: topRiser?.item.title || '暂无变化',
      hint: topRiser ? `${CATEGORY_TEXT[topRiser.item.type]} · ${formatSigned(topRiser.delta.scoreDelta, ' 分')}` : '暂无连续快照趋势',
    },
    {
      label: '排名跃升',
      value: rankRiser?.item.title || '暂无趋势',
      hint: rankRiser && rankRiser.delta.rankDelta > 0 ? `真实快照排名上升 ${rankRiser.delta.rankDelta} 位` : '排名暂无明显跃升',
    },
    {
      label: '来源活跃',
      value: topSource?.[0] || '暂无来源',
      hint: topSource ? `${topSource[1]} 条真实数据记录正在参与排序` : '暂无来源统计',
    },
    {
      label: '今日观察',
      value: latest?.title || '暂无更新',
      hint: latest ? `${CATEGORY_TEXT[latest.type]} · 综合分 ${getTotalScore({ metrics: latest.metrics, hotScore: latest.hotScore }).toFixed(1)}` : '暂无当日数据',
    },
  ];

  return (
    <section className="today-changes-panel" aria-label="今日变化">
      <div className="today-changes-head">
        <div>
          <span>Today</span>
          <h2>今日变化</h2>
        </div>
        <p>基于当前页加载的真实榜单与历史快照，只展示已采集的可追溯变化。</p>
      </div>
      <div className="today-changes-grid">
        {cards.map(card => (
          <article key={card.label} className="today-change-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <em>{card.hint}</em>
          </article>
        ))}
      </div>
    </section>
  );
}
