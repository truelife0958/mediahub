import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRankingMeta,
  buildRankingReason,
  confidenceLabelForEvidence,
  normalizeRankingEvidence,
} from '../src/store/rankingEvidence.js';

test('normalizeRankingEvidence keeps only usable source backed evidence', () => {
  const result = normalizeRankingEvidence([
    {
      sourceId: 'hongguo',
      sourceName: '红果短剧热榜',
      sourceUrl: 'https://www.iesdouyin.com/',
      rank: '3',
      evidenceType: 'platform_rank',
      confidence: 0.8,
      note: '平台公开榜单',
    },
    { sourceName: 'missing url', evidenceType: 'platform_rank' },
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    sourceId: 'hongguo',
    sourceName: '红果短剧热榜',
    sourceUrl: 'https://www.iesdouyin.com/',
    capturedAt: undefined,
    rank: 3,
    score: undefined,
    evidenceType: 'platform_rank',
    confidence: 0.8,
    note: '平台公开榜单',
  });
});

test('confidenceLabelForEvidence returns high medium low labels', () => {
  assert.equal(confidenceLabelForEvidence([{ confidence: 0.9 }]), 'high');
  assert.equal(confidenceLabelForEvidence([{ confidence: 0.6 }]), 'medium');
  assert.equal(confidenceLabelForEvidence([{ confidence: 0.2 }]), 'low');
  assert.equal(confidenceLabelForEvidence([]), 'low');
});

test('buildRankingReason prefers authority rank then platform rank', () => {
  const evidence = normalizeRankingEvidence([
    { sourceId: 'annual', sourceName: '年度短剧榜', sourceUrl: 'https://example.com/year', rank: 4, evidenceType: 'annual_rank', confidence: 0.95 },
    { sourceId: 'hongguo', sourceName: '红果短剧', sourceUrl: 'https://example.com/hg', rank: 2, evidenceType: 'platform_rank', confidence: 0.8 },
  ]);

  assert.equal(
    buildRankingReason({ title: '盛夏芬德拉', rankingEvidence: evidence }),
    '权威榜「年度短剧榜」第4名，平台榜「红果短剧」第2名，来源可信度高。'
  );
});

test('buildRankingMeta extracts authority and platform ranks', () => {
  const evidence = normalizeRankingEvidence([
    { sourceId: 'annual', sourceName: '年度短剧榜', sourceUrl: 'https://example.com/year', rank: 8, evidenceType: 'annual_rank', confidence: 0.95 },
    { sourceId: 'fanqie', sourceName: '番茄小说热榜', sourceUrl: 'https://example.com/fq', rank: 5, evidenceType: 'platform_rank', confidence: 0.75 },
  ]);

  const meta = buildRankingMeta({ title: '一品布衣', rank: 3, metrics: { totalScore: 91.2 }, rankingEvidence: evidence });

  assert.equal(meta.displayRank, 3);
  assert.equal(meta.compositeScore, 91.2);
  assert.equal(meta.authorityRank, 8);
  assert.equal(meta.authoritySource, '年度短剧榜');
  assert.equal(meta.bestPlatformRank, 5);
  assert.equal(meta.bestPlatformSource, '番茄小说热榜');
  assert.equal(meta.sourceConfidence, 'high');
  assert.equal(meta.updatedBy, 'seed_backfill');
  assert.match(meta.rankingReason, /权威榜/);
});

test('official rank and platform rank coexist without official replacing platform source', () => {
  const evidence = normalizeRankingEvidence([
    { sourceId: 'official', sourceName: '官方精选榜', sourceUrl: 'https://example.com/official', rank: 1, evidenceType: 'official_rank', confidence: 0.92 },
    { sourceId: 'kuaishou', sourceName: '快手短剧热榜', sourceUrl: 'https://example.com/ks', rank: 6, evidenceType: 'platform_rank', confidence: 0.76 },
  ]);

  const meta = buildRankingMeta({ title: '官方与平台双榜', rankingEvidence: evidence });

  assert.equal(meta.authorityRank, 1);
  assert.equal(meta.authoritySource, '官方精选榜');
  assert.equal(meta.bestPlatformRank, 6);
  assert.equal(meta.bestPlatformSource, '快手短剧热榜');
  assert.equal(
    buildRankingReason({ title: '官方与平台双榜', rankingEvidence: evidence }),
    '权威榜「官方精选榜」第1名，平台榜「快手短剧热榜」第6名，来源可信度高。'
  );
});

test('fractional small and invalid ranks do not become zero rank evidence', () => {
  const evidence = normalizeRankingEvidence([
    { sourceId: 'small', sourceName: '小数平台榜', sourceUrl: 'https://example.com/small', rank: 0.4, evidenceType: 'platform_rank', confidence: 0.7 },
    { sourceId: 'invalid', sourceName: '无效权威榜', sourceUrl: 'https://example.com/invalid', rank: 'not-a-number', evidenceType: 'annual_rank', confidence: 0.9 },
  ]);

  assert.equal(evidence[0].rank, undefined);
  assert.equal(evidence[1].rank, undefined);

  const meta = buildRankingMeta({ title: '无有效名次', rankingEvidence: evidence });

  assert.equal(meta.authorityRank, undefined);
  assert.equal(meta.authoritySource, undefined);
  assert.equal(meta.bestPlatformRank, undefined);
  assert.equal(meta.bestPlatformSource, undefined);
  assert.doesNotMatch(meta.rankingReason, /第0名|第0\.4名|权威榜「|平台榜「/);
});

test('normalizeRankingEvidence clamps confidence and supports aliases and fallbacks', () => {
  const result = normalizeRankingEvidence([
    {
      provider: 'alias-provider',
      label: '别名来源',
      url: 'https://example.com/alias',
      rank: '12',
      value: '88.5',
      evidenceType: 'unknown_type',
      confidence: 1.4,
    },
    {
      sourceName: '低可信来源',
      sourceUrl: 'https://example.com/low',
      evidenceType: 'topic_signal',
      confidence: -0.3,
    },
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    sourceId: 'alias-provider',
    sourceName: '别名来源',
    sourceUrl: 'https://example.com/alias',
    capturedAt: undefined,
    rank: 12,
    score: 88.5,
    evidenceType: 'platform_rank',
    confidence: 1,
    note: undefined,
  });
  assert.equal(result[1].confidence, 0);
  assert.equal(confidenceLabelForEvidence(result), 'high');
});
