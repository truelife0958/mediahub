function clamp(value, min = 0, max = 100) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function scoreByCeiling(value, ceiling) {
  const numericValue = Number(value) || 0;
  if (numericValue <= 0) return 0;
  return Math.max(1, Math.round(clamp(numericValue / ceiling, 0, 1) * 100));
}

function scoreByRank(value, maxRank = 50) {
  const rank = Number(value);
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  if (rank <= 1) return 100;
  return Math.round(clamp(1 - ((rank - 1) / (maxRank - 1)), 0, 1) * 100);
}

function calculateCompositeScore(metrics = {}) {
  const playOrReadScore = scoreByCeiling(metrics.playOrReadYi, 10);
  const platformRank = metrics.platformOriginalRank || metrics.platformHotRank || metrics.newDramaRank;
  const platformHeatScore = Number(metrics.platformHeatWan) > 0
    ? scoreByCeiling(metrics.platformHeatWan, 7800)
    : scoreByRank(platformRank);
  const searchIndexScore = scoreByCeiling(metrics.searchIndex, 10000);
  const topicValue = Number(metrics.topicPlayYi) > 0
    ? metrics.topicPlayYi
    : metrics.topicSignalScore;
  const topicScore = Number(metrics.topicPlayYi) > 0
    ? scoreByCeiling(metrics.topicPlayYi, 3.65)
    : scoreByCeiling(topicValue, 100);
  const sourceSignalScore = scoreByCeiling(metrics.sourceSignalScore, 100);
  const rankRecommendationScore = scoreByCeiling(metrics.rankRecommendationScore, 100);
  const authorityRankScore = scoreByCeiling(metrics.authorityRankScore, 100);
  const platformOriginalRank = platformRank || undefined;
  const explicitPlatformRankScore = Number(metrics.platformRankScore) > 0
    ? scoreByCeiling(metrics.platformRankScore, 100)
    : 0;
  const platformRankScore = explicitPlatformRankScore > 0
    ? explicitPlatformRankScore
    : scoreByRank(platformOriginalRank, 50);
  const sourceConfidenceScore = scoreByCeiling(metrics.sourceConfidenceScore, 100);
  const hasMixedRankingSignal = authorityRankScore > 0
    || explicitPlatformRankScore > 0
    || Number(metrics.platformOriginalRank) > 0
    || sourceConfidenceScore > 0;

  let totalScoreValue;
  if (authorityRankScore > 0) {
    const weightedScore = authorityRankScore * 0.58
      + platformRankScore * 0.17
      + sourceConfidenceScore * 0.15
      + sourceSignalScore * 0.06
      + searchIndexScore * 0.02
      + topicScore * 0.02;
    totalScoreValue = Math.max(weightedScore, authorityRankScore * 0.91);
  } else if (hasMixedRankingSignal) {
    totalScoreValue = platformRankScore * 0.42
      + sourceConfidenceScore * 0.22
      + sourceSignalScore * 0.18
      + platformHeatScore * 0.1
      + searchIndexScore * 0.05
      + topicScore * 0.03;
  } else if (rankRecommendationScore > 0) {
    totalScoreValue = rankRecommendationScore * 0.9
      + sourceSignalScore * 0.08
      + platformHeatScore * 0.008
      + searchIndexScore * 0.006
      + topicScore * 0.006;
  } else if (sourceSignalScore > 0) {
    totalScoreValue = playOrReadScore * 0.135
      + platformHeatScore * 0.1725
      + searchIndexScore * 0.09
      + topicScore * 0.0525
      + sourceSignalScore * 0.55;
  } else {
    totalScoreValue = playOrReadScore * 0.4
      + platformHeatScore * 0.3
      + searchIndexScore * 0.2
      + topicScore * 0.1;
  }

  const totalScore = Number(totalScoreValue.toFixed(1));

  return {
    playOrReadScore,
    platformHeatScore,
    searchIndexScore,
    topicScore,
    sourceSignalScore,
    rankRecommendationScore,
    authorityRankScore,
    platformRankScore,
    sourceConfidenceScore,
    platformOriginalRank,
    totalScore,
  };
}

export { calculateCompositeScore };
