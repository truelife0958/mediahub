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
