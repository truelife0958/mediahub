import { calculateCompositeScore } from './scoreCalculator.js';

const PLATFORM_ORDER = ['baidu', 'weibo', 'douyin', 'wechat'];

function toList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function getMatchTerms(item) {
  return [
    item?.title,
    item?.ipName,
    item?.author,
    ...toList(item?.actors),
  ]
    .map(normalizeMatchText)
    .filter(term => term.length >= 2);
}

function signalMatchesItem(signal, item) {
  const keyword = normalizeMatchText(signal?.keyword);
  if (keyword.length < 2) return false;
  return getMatchTerms(item).some(term => keyword.includes(term) || term.includes(keyword));
}

function maxMetric(current, next) {
  const currentNum = Number(current);
  const nextNum = Number(next);
  if (!Number.isFinite(nextNum)) return current;
  if (!Number.isFinite(currentNum)) return nextNum;
  return Math.max(currentNum, nextNum);
}

function summarizeSignal(signal) {
  return {
    platform: signal.platform,
    platformName: signal.platformName || signal.platform,
    keyword: signal.keyword,
    rank: signal.rank || 0,
    sourceUrl: signal.sourceUrl || '',
    capturedAt: signal.capturedAt || '',
    searchIndex: signal.searchIndex,
    topicPlayYi: signal.topicPlayYi,
    heatValue: signal.heatValue,
    topicSignalScore: signal.topicSignalScore,
  };
}

function toEvidence(signal) {
  return {
    label: `${signal.platformName || signal.platform} #${signal.rank || 0}`,
    url: signal.sourceUrl || '',
    keyword: signal.keyword || '',
    capturedAt: signal.capturedAt || '',
  };
}

function sortSignals(a, b) {
  const platformA = PLATFORM_ORDER.indexOf(a.platform);
  const platformB = PLATFORM_ORDER.indexOf(b.platform);
  const orderA = platformA === -1 ? PLATFORM_ORDER.length : platformA;
  const orderB = platformB === -1 ? PLATFORM_ORDER.length : platformB;
  if (orderA !== orderB) return orderA - orderB;
  return (Number(a.rank) || 999) - (Number(b.rank) || 999);
}

function mergeMetrics(metrics, signals) {
  const merged = { ...(metrics || {}) };

  for (const signal of signals) {
    merged.searchIndex = maxMetric(merged.searchIndex, signal.searchIndex);
    merged.topicPlayYi = maxMetric(merged.topicPlayYi, signal.topicPlayYi);
    merged.topicSignalScore = maxMetric(merged.topicSignalScore, signal.topicSignalScore);
  }

  return {
    ...merged,
    ...calculateCompositeScore(merged),
  };
}

function mergeHotSignalsIntoItems(items = [], signals = []) {
  const signalList = Array.isArray(signals) ? signals.filter(signal => signal?.platform && signal?.keyword) : [];

  return (Array.isArray(items) ? items : []).map(item => {
    const matchedSignals = signalList
      .filter(signal => signalMatchesItem(signal, item))
      .sort(sortSignals);

    return {
      ...item,
      metrics: mergeMetrics(item?.metrics, matchedSignals),
      hotSignals: matchedSignals.map(summarizeSignal),
      evidence: [
        ...(Array.isArray(item?.evidence) ? item.evidence : []),
        ...matchedSignals.map(toEvidence),
      ],
    };
  });
}

export {
  mergeHotSignalsIntoItems,
  signalMatchesItem,
};
