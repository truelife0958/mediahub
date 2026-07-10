import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCreatorBreakdown,
  buildDashboardHighlights,
  buildIpBreakdown,
  buildMetricAverages,
  buildRankDashboardSummary,
  buildRankItemContext,
  buildSourceBreakdown,
  buildTagBreakdown,
  formatRankDate,
  getBoardDisplayTotal,
  getSourceDisplayName,
  sortRankItemsByScore,
  sortRankItemsByRank,
  type RankBoardItemLike,
} from '../src/utils/rankBoard.ts';

const SAMPLE_ITEMS: RankBoardItemLike[] = [
  {
    type: 'drama',
    title: '许你万丈光芒好',
    tags: ['娱乐圈逆袭', '霸总甜宠', '萌娃助攻'],
    actors: ['马小宇', '余茵'],
    ipName: '万丈光芒宇宙',
    updatedAt: '2026-06-24T12:00:00.000Z',
    sourceProvider: 'hongguo',
    hotScore: 773000,
    metrics: {
      totalScore: 77.3,
      playOrReadScore: 100,
      platformHeatScore: 95,
      topicScore: 88,
    },
    hotSignals: [
      { platform: 'douyin', platformName: '抖音' },
      { platform: 'weibo', platformName: '微博' },
    ],
    rank: 1,
  },
  {
    type: 'novel',
    title: '我在精神病院学斩神',
    tags: ['都市脑洞', '群像', '热血'],
    author: '三九音域',
    ipName: '斩神宇宙',
    updatedAt: '2026-06-23T10:00:00.000Z',
    sourceProvider: 'fanqie',
    hotScore: 300000,
    metrics: {
      totalScore: 30,
      platformHeatScore: 100,
    },
    hotSignals: [
      { platform: 'baidu', platformName: '百度' },
    ],
    rank: 2,
  },
];

describe('rank board helpers', () => {
  it('builds readable item context for drama entries', () => {
    const context = buildRankItemContext(SAMPLE_ITEMS[0]);
    assert.deepEqual(context.tags, ['娱乐圈逆袭', '霸总甜宠']);
    assert.deepEqual(context.facts, [
      '主演 马小宇 / 余茵',
      'IP 万丈光芒宇宙',
      '更新 06/24',
    ]);
  });

  it('builds dashboard summary from ranked items', () => {
    const summary = buildRankDashboardSummary(SAMPLE_ITEMS);
    assert.equal(summary.visibleCount, 2);
    assert.equal(summary.sourceCount, 2);
    assert.equal(summary.categoryCount, 6);
    assert.equal(summary.topScore, 77.3);
    assert.equal(summary.averageScore, 53.65);
    assert.deepEqual(summary.sourceLabels, ['红果短剧', '番茄小说']);
    assert.deepEqual(summary.signalLabels, ['抖音', '微博', '百度']);
    assert.equal(summary.boardDate, '2026-06-24T12:00:00.000Z');
  });

  it('prefers API total for the all-category board count', () => {
    assert.equal(getBoardDisplayTotal({ apiTotal: 100, visibleCount: 20, selectedCategory: '' }), 100);
    assert.equal(getBoardDisplayTotal({ apiTotal: 100, visibleCount: 7, selectedCategory: '甜宠' }), 7);
    assert.equal(getBoardDisplayTotal({ apiTotal: 0, visibleCount: 20, selectedCategory: '' }), 20);
  });

  it('builds analytics summaries for metrics, sources, people, and IP', () => {
    assert.deepEqual(buildMetricAverages(SAMPLE_ITEMS), [
      { id: 'playOrRead', label: '播放', score: 50 },
      { id: 'platformHeat', label: '平台', score: 97.5 },
      { id: 'searchIndex', label: '热搜', score: 0 },
      { id: 'topic', label: '话题', score: 44 },
    ]);

    assert.deepEqual(buildSourceBreakdown(SAMPLE_ITEMS), [
      {
        name: '红果短剧',
        count: 1,
        bestScore: 77.3,
        topTitle: '许你万丈光芒好',
        share: 50,
      },
      {
        name: '番茄小说',
        count: 1,
        bestScore: 30,
        topTitle: '我在精神病院学斩神',
        share: 50,
      },
    ]);

    const creators = buildCreatorBreakdown(SAMPLE_ITEMS).slice(0, 2);
    assert.equal(creators.length, 2);
    assert.equal(creators.every(item => item.count === 1 && item.bestScore === 77.3), true);
    assert.deepEqual(creators.map(item => item.name).sort((a, b) => a.localeCompare(b, 'zh-CN')), ['马小宇', '余茵']);
    assert.deepEqual(buildIpBreakdown(SAMPLE_ITEMS), [
      { name: '万丈光芒宇宙', count: 1, bestScore: 77.3 },
      { name: '斩神宇宙', count: 1, bestScore: 30 },
    ]);
    assert.equal(
      ['娱乐圈逆袭', '霸总甜宠', '萌娃助攻'].includes(buildTagBreakdown(SAMPLE_ITEMS)[0].name),
      true,
    );
  });

  it('builds dashboard highlight copy', () => {
    const highlights = buildDashboardHighlights(SAMPLE_ITEMS);
    assert.equal(highlights[0].label, '热度峰值');
    assert.equal(highlights[0].value, '许你万丈光芒好');
    assert.equal(highlights[1].value, '红果短剧');
    assert.equal(highlights[2].value, buildTagBreakdown(SAMPLE_ITEMS)[0].name);
  });

  it('sorts higher score items first and maps source names', () => {
    const sorted = sortRankItemsByScore(SAMPLE_ITEMS);
    assert.equal(sorted[0].title, '许你万丈光芒好');
    assert.equal(getSourceDisplayName('', 'qidian'), '起点中文网');
    assert.equal(formatRankDate('2026-06-24T12:00:00.000Z'), '06/24');
  });

  it('sorts board rows by real rank before score', () => {
    const sorted = sortRankItemsByRank([
      { ...SAMPLE_ITEMS[0], rank: 2 },
      { ...SAMPLE_ITEMS[1], rank: 1 },
    ]);

    assert.equal(sorted[0].rank, 1);
  });

});
