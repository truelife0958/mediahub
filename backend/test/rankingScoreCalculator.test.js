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

test('realPlayCount is preferred over playOrReadYi for scoring', () => {
  const withReal = calculateCompositeScore({
    playOrReadYi: 0.26,
    realPlayCount: 258_400_000,
  });
  const withoutReal = calculateCompositeScore({
    playOrReadYi: 0.26,
  });

  // With realPlayCount=2.58亿, scoreByCeiling(2.584e8, 1e9) ≈ 26
  // With playOrReadYi=0.26, scoreByCeiling(0.26, 10) = 3
  assert.ok(withReal.playOrReadScore > withoutReal.playOrReadScore,
    `realPlayCount score (${withReal.playOrReadScore}) should exceed playOrReadYi score (${withoutReal.playOrReadScore})`);
});

test('extreme playOrReadYi without realPlayCount is discounted', () => {
  const extreme = calculateCompositeScore({
    playOrReadYi: 9.6,
  });
  const moderate = calculateCompositeScore({
    playOrReadYi: 1.5,
  });

  // playOrReadYi=9.6 would give scoreByCeiling(9.6,10)=96, but 0.6 discount → ~58
  // playOrReadYi=1.5 gives scoreByCeiling(1.5,10)=15, no discount
  assert.ok(extreme.playOrReadScore < 96,
    `extreme playOrReadYi should be discounted (got ${extreme.playOrReadScore}, not 96)`);
  assert.ok(extreme.playOrReadScore > moderate.playOrReadScore,
    `discounted extreme should still exceed moderate (${extreme.playOrReadScore} > ${moderate.playOrReadScore})`);
});

test('rankRecommendationScore branch weights sum to 1.0', () => {
  const score = calculateCompositeScore({
    rankRecommendationScore: 100,
    sourceSignalScore: 100,
    platformHeatWan: 7800,
    searchIndex: 10000,
    topicPlayYi: 3.65,
  });

  // All sub-scores should be ~100, so totalScore should be ~100 if weights sum to 1.0
  assert.ok(score.totalScore >= 99,
    `branch 3 weights should be normalized (totalScore=${score.totalScore}, expected ~100)`);
});
