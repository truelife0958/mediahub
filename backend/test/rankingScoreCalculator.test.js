import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCompositeScore } from '../src/store/scoreCalculator.js';

test('authority ranking dominates mixed score', () => {
  const score = calculateCompositeScore({
    authorityRankScore: 100,
    platformOriginalRank: 20,
    sourceConfidenceScore: 90,
    sourceSignalScore: 70,
    searchIndex: 2000,
  });

  assert.equal(score.authorityRankScore, 100);
  assert.equal(score.platformRankScore, 61);
  assert.equal(score.sourceConfidenceScore, 90);
  assert.ok(score.totalScore >= 91);
});

test('platform original rank contributes when authority score is absent', () => {
  const first = calculateCompositeScore({ platformOriginalRank: 1, sourceConfidenceScore: 70 });
  const tenth = calculateCompositeScore({ platformOriginalRank: 10, sourceConfidenceScore: 70 });

  assert.equal(first.platformRankScore, 100);
  assert.equal(tenth.platformRankScore, 82);
  assert.ok(first.totalScore > tenth.totalScore);
});

test('legacy rankRecommendationScore path remains supported', () => {
  const score = calculateCompositeScore({ rankRecommendationScore: 95, sourceSignalScore: 80 });

  assert.equal(score.rankRecommendationScore, 95);
  assert.ok(score.totalScore > 85);
});


test('platformOriginalRank falls back to legacy platform rank fields', () => {
  const score = calculateCompositeScore({ platformHotRank: 7, sourceConfidenceScore: 50 });

  assert.equal(score.platformOriginalRank, 7);
  assert.equal(score.platformRankScore, 88);
});
