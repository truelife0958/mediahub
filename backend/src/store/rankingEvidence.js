const EVIDENCE_TYPES = new Set([
  'official_rank',
  'platform_rank',
  'annual_rank',
  'search_signal',
  'topic_signal',
  'manual_verified',
]);

const AUTHORITY_TYPES = new Set(['annual_rank', 'official_rank', 'manual_verified']);
const PLATFORM_TYPES = new Set(['platform_rank', 'official_rank']);

function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function toOptionalPositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.round(numeric);
}

function toOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeRankingEvidence(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      const evidenceType = EVIDENCE_TYPES.has(entry?.evidenceType) ? entry.evidenceType : 'platform_rank';
      const sourceName = String(entry?.sourceName || entry?.label || '').trim();
      const sourceUrl = String(entry?.sourceUrl || entry?.url || '').trim();
      if (!sourceName || !sourceUrl) return null;
      return {
        sourceId: String(entry?.sourceId || entry?.provider || sourceName).trim(),
        sourceName,
        sourceUrl,
        capturedAt: entry?.capturedAt ? String(entry.capturedAt) : undefined,
        rank: toOptionalPositiveInteger(entry?.rank),
        score: toOptionalNumber(entry?.score ?? entry?.value),
        evidenceType,
        confidence: clamp(entry?.confidence ?? 0.6),
        note: entry?.note ? String(entry.note).trim() : undefined,
      };
    })
    .filter(Boolean);
}

function confidenceLabelForEvidence(evidence = []) {
  const maxConfidence = evidence.reduce((max, entry) => Math.max(max, Number(entry?.confidence) || 0), 0);
  if (maxConfidence >= 0.8) return 'high';
  if (maxConfidence >= 0.5) return 'medium';
  return 'low';
}

function bestRankByType(evidence, typeSet) {
  return evidence
    .filter(entry => typeSet.has(entry.evidenceType) && Number.isFinite(Number(entry.rank)))
    .sort((a, b) => Number(a.rank) - Number(b.rank))[0];
}

function buildRankingReason(item = {}) {
  const evidence = normalizeRankingEvidence(item.rankingEvidence || item.evidence || []);
  const authority = bestRankByType(evidence, AUTHORITY_TYPES);
  const platform = bestRankByType(evidence, PLATFORM_TYPES);
  const confidenceText = confidenceLabelForEvidence(evidence) === 'high' ? '高' : confidenceLabelForEvidence(evidence) === 'medium' ? '中' : '低';
  const parts = [];
  if (authority) parts.push(`权威榜「${authority.sourceName}」第${authority.rank}名`);
  if (platform) parts.push(`平台榜「${platform.sourceName}」第${platform.rank}名`);
  if (!parts.length && evidence[0]) parts.push(`来源「${evidence[0].sourceName}」信号`);
  return `${parts.join('，') || '综合热度信号'}，来源可信度${confidenceText}。`;
}

function buildRankingMeta(item = {}) {
  const evidence = normalizeRankingEvidence(item.rankingEvidence || item.evidence || []);
  const authority = bestRankByType(evidence, AUTHORITY_TYPES);
  const platform = bestRankByType(evidence, PLATFORM_TYPES);
  return {
    displayRank: Number(item.rank) || 0,
    compositeScore: Number(item.metrics?.totalScore) || 0,
    authorityRank: authority?.rank,
    authoritySource: authority?.sourceName,
    bestPlatformRank: platform?.rank,
    bestPlatformSource: platform?.sourceName,
    sourceConfidence: confidenceLabelForEvidence(evidence),
    rankingReason: buildRankingReason({ ...item, rankingEvidence: evidence }),
    updatedBy: item.updatedBy || 'seed_backfill',
  };
}

export {
  buildRankingMeta,
  buildRankingReason,
  confidenceLabelForEvidence,
  normalizeRankingEvidence,
};
