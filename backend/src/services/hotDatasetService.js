import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createApiError } from '../utils/apiErrors.js';
import { buildRelationsForItems } from '../store/relationBuilder.js';
import { buildRankingMeta, normalizeRankingEvidence } from '../store/rankingEvidence.js';
import { calculateCompositeScore } from '../store/scoreCalculator.js';
import {
  getTodayKey,
  readCurrentDataset,
  readCrawlLog,
  readIndex,
  readSeedItems,
  resolveDataDir,
  writeCurrentDataset,
  writeIndexes,
  writeSnapshotDataset,
} from '../store/jsonStore.js';
import { CONTENT_TYPES } from '../constants/contentTypes.js';

const VALID_TYPES = new Set(CONTENT_TYPES);
const MAX_QUERY_PAGE = 1000;
const MAX_KEYWORD_LENGTH = 80;
const DAILY_REFRESH_ITEM_TARGET = 100;
const HEAT_METRIC_BY_TYPE = {
  drama: 'playback',
  novel: 'reading',
  anime: 'playback',
  comic: 'reading',
};

function ensureType(type) {
  if (!VALID_TYPES.has(type)) {
    throw createApiError('invalid_request', 'Invalid content type');
  }
}

function asList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function hasBrokenText(value) {
  const text = String(value || '');
  const markers = ['\u951f', '\u95ff', '\u95c1', '\u5a75', '\u6fde', '\u95bb', '\u942d', '\u7f01'];
  return markers.some(marker => text.includes(marker));
}

function isValidHotItem(item) {
  if (!item?.id || !item?.type || !item?.title) return false;
  if (!VALID_TYPES.has(item.type)) return false;
  return !hasBrokenText(item.title) && !hasBrokenText(item.summary);
}

function normalizeHotItem(item, { now = new Date() } = {}) {
  const sourceObject = item.source && typeof item.source === 'object' ? item.source : null;
  const sourceProvider = sourceObject?.provider || item.source || item.sourceProvider || 'composite';
  const sourceLabel = sourceObject?.label || item.sourceName || item.sourceLabel || 'Composite Board';
  const sourceUrl = sourceObject?.url || item.sourceUrl || item.url || '';
  const baseMetrics = item.metrics || {};
  const rankingEvidence = normalizeRankingEvidence(item.rankingEvidence || item.evidence || []);
  const calculated = Object.keys(baseMetrics).length > 0
    ? calculateCompositeScore(baseMetrics)
    : {
      playOrReadScore: 0,
      platformHeatScore: 0,
      searchIndexScore: 0,
      topicScore: 0,
      totalScore: Math.max(0, Math.min(100, (Number(item.hotScore) || 0) / 10000)),
    };
  const metrics = {
    ...baseMetrics,
    ...calculated,
  };
  return {
    ...item,
    actors: asList(item.actors),
    characters: asList(item.characters),
    categories: asList(item.categories || item.tags),
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    rankingEvidence,
    source: String(sourceProvider).trim() || 'composite',
    sourceName: String(sourceLabel).trim() || 'Composite Board',
    sourceUrl: String(sourceUrl).trim(),
    ipName: String(item.ipName || item.title || '').trim(),
    author: String(item.author || '').trim(),
    summary: String(item.summary || '').trim(),
    status: String(item.status || 'ongoing').trim() || 'ongoing',
    capturedAt: now.toISOString(),
    metrics,
  };
}

function toContent(item, rank = 0, { trend = [] } = {}) {
  const updatedAt = item.updatedAt || item.capturedAt;
  return {
    id: item.id,
    title: item.title,
    cover: item.cover || '',
    summary: item.summary,
    type: item.type,
    tags: item.categories,
    actors: item.actors,
    characters: item.characters || [],
    author: item.author || item.sourceName,
    ipName: item.ipName || item.title,
    status: item.status || 'ongoing',
    hotScore: Math.round((Number(item.metrics?.totalScore) || 0) * 10000),
    heatMetric: HEAT_METRIC_BY_TYPE[item.type] || 'playback',
    createdAt: item.createdAt || item.capturedAt,
    updatedAt,
    cachedAt: updatedAt,
    stale: false,
    source: {
      provider: item.source,
      label: item.sourceName,
      url: item.sourceUrl,
    },
    metrics: item.metrics,
    rank,
    rankingEvidence: item.rankingEvidence || [],
    rankingMeta: item.rankingMeta || buildRankingMeta({ ...item, rank }),
    relations: item.relations || { sameIp: [], sameActors: [], sameCategories: [], sameCategory: [] },
    leaderboardEvidence: item.evidence,
    hotSignals: Array.isArray(item.hotSignals) ? item.hotSignals : [],
    trend,
  };
}

function positiveRank(value) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank > 0 ? rank : 0;
}

function sortItems(items, sort = 'hot') {
  const list = [...items];
  list.sort((a, b) => {
    if (sort === 'latest') return Date.parse(b.capturedAt || '') - Date.parse(a.capturedAt || '');

    const aAuthorityRank = positiveRank(a.metrics?.authorityOriginalRank || a.metrics?.annualRank);
    const bAuthorityRank = positiveRank(b.metrics?.authorityOriginalRank || b.metrics?.annualRank);
    if (aAuthorityRank && bAuthorityRank && aAuthorityRank !== bAuthorityRank) return aAuthorityRank - bAuthorityRank;
    if (aAuthorityRank && !bAuthorityRank) return -1;
    if (!aAuthorityRank && bAuthorityRank) return 1;

    const aPlatformRank = positiveRank(a.metrics?.platformOriginalRank || a.metrics?.platformRank);
    const bPlatformRank = positiveRank(b.metrics?.platformOriginalRank || b.metrics?.platformRank);
    if (aPlatformRank && bPlatformRank && aPlatformRank !== bPlatformRank) return aPlatformRank - bPlatformRank;
    if (aPlatformRank && !bPlatformRank) return -1;
    if (!aPlatformRank && bPlatformRank) return 1;

    return (Number(b.metrics?.totalScore) || 0) - (Number(a.metrics?.totalScore) || 0);
  });
  return list;
}

function matchesKeyword(item, keyword = '') {
  const normalized = String(keyword || '').trim().slice(0, MAX_KEYWORD_LENGTH).toLowerCase();
  if (!normalized) return true;
  const fields = [
    item.title,
    item.summary,
    item.author,
    item.ipName,
    item.sourceName,
    ...item.actors,
    ...(item.characters || []),
    ...item.categories,
  ];
  return fields.some(value => String(value || '').toLowerCase().includes(normalized));
}

function paginate(list, page = 1, limit = 20) {
  const pageNum = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const start = (pageNum - 1) * limitNum;
  return {
    pageNum,
    limitNum,
    slice: list.slice(start, start + limitNum),
  };
}

function normalizePreviewLimit(limit = 10) {
  return Math.min(50, Math.max(1, Number(limit) || 10));
}

function toPreviewItem(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    rank: item.rank || 0,
    source: item.source,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    actors: item.actors || [],
    author: item.author || '',
    ipName: item.ipName || item.title || '',
    categories: item.categories || [],
    metrics: item.metrics || {},
    hotSignals: Array.isArray(item.hotSignals) ? item.hotSignals : [],
    rankingEvidence: item.rankingEvidence || [],
    rankingMeta: item.rankingMeta || buildRankingMeta(item),
    capturedAt: item.capturedAt || '',
  };
}

function buildDataset(type, rawItems, { now = new Date() } = {}) {
  const items = rawItems
    .map(item => normalizeHotItem({ ...item, type: item.type || type }, { now }))
    .filter(isValidHotItem);
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  const sortedItems = sortItems(unique).slice(0, DAILY_REFRESH_ITEM_TARGET).map((item, index) => {
    const ranked = { ...item, rank: index + 1 };
    return {
      ...ranked,
      rankingMeta: buildRankingMeta(ranked),
    };
  });
  const rankedItems = buildRelationsForItems(sortedItems);
  return {
    type,
    date: getTodayKey(now),
    capturedAt: now.toISOString(),
    items: rankedItems,
  };
}

function addIndexValue(index, value, item) {
  const key = String(value || '').trim();
  if (!key) return;
  const bucket = index[key] || [];
  if (!bucket.some(entry => entry.id === item.id)) {
    bucket.push({ id: item.id, type: item.type, title: item.title, hotScore: Math.round((Number(item.metrics?.totalScore) || 0) * 10000) });
  }
  index[key] = bucket;
}

async function rebuildIndexes({ dataDir, types = [...VALID_TYPES] } = {}) {
  const actor = {};
  const ip = {};
  const category = {};

  for (const type of types) {
    const dataset = await readCurrentDataset(type, { dataDir });
    for (const item of dataset?.items || []) {
      for (const actorName of item.actors || []) addIndexValue(actor, actorName, item);
      addIndexValue(ip, item.ipName || item.title, item);
      for (const categoryName of item.categories || []) addIndexValue(category, categoryName, item);
    }
  }

  await writeIndexes({ actor, ip, category }, { dataDir });
  return { actor, ip, category };
}

async function refreshHotDataset(type, { dataDir, seeds, extraItems = [], now = new Date() } = {}) {
  ensureType(type);
  const previousDataset = await readCurrentOrLatestSnapshotDataset(type, { dataDir });
  const seedItems = Array.isArray(seeds) ? seeds : await readSeedItems(type, { dataDir });
  const dataset = buildDataset(type, [...seedItems, ...extraItems], { now });
  const fallbackUsed = dataset.items.length === 0 && previousDataset?.items?.length > 0;
  const datasetToPersist = fallbackUsed ? previousDataset : dataset;

  await writeCurrentDataset(type, datasetToPersist, { dataDir });
  await writeSnapshotDataset(type, datasetToPersist, { dataDir, now });
  await rebuildIndexes({ dataDir });
  return {
    type,
    status: 'success',
    count: datasetToPersist.items.length,
    fallbackUsed,
    list: datasetToPersist.items.map((item, index) => toContent(item, index + 1)),
    dataset: datasetToPersist,
  };
}

async function ensureHotDataset(type, { dataDir, now = new Date() } = {}) {
  ensureType(type);
  const existing = await readCurrentOrLatestSnapshotDataset(type, { dataDir });
  if (existing?.items?.length > 0) return existing;
  return (await refreshHotDataset(type, { dataDir, now })).dataset;
}

async function readCurrentOrLatestSnapshotDataset(type, { dataDir } = {}) {
  const current = await readCurrentDataset(type, { dataDir });
  if (current?.items?.length > 0) return current;
  const snapshotDates = await listSnapshotDates({ dataDir, limit: 12 });
  for (const date of [...snapshotDates].reverse()) {
    const snapshot = await readSnapshotDatasetByDate(type, date, { dataDir });
    if (snapshot?.items?.length > 0) {
      return {
        ...snapshot,
        fallbackUsed: true,
        fallbackSource: `snapshots/${date}/${type}.json`,
      };
    }
  }
  return null;
}

async function readSnapshotDatasetByDate(type, date, { dataDir } = {}) {
  try {
    const root = resolveDataDir(dataDir);
    return JSON.parse(await readFile(join(root, 'snapshots', date, `${type}.json`), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function listSnapshotDates({ dataDir, limit = 8 } = {}) {
  try {
    const root = resolveDataDir(dataDir);
    const entries = await readdir(join(root, 'snapshots'), { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map(entry => entry.name)
      .sort()
      .slice(-Math.max(2, Number(limit) || 8));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizeTrendTitle(value = '') {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeTrendPoint(date, item) {
  const score = Number(item?.metrics?.totalScore) || 0;
  const rank = Number(item?.rank) || 0;
  if (score <= 0 && rank <= 0) return null;
  return {
    date,
    score: Math.round(score * 10) / 10,
    rank,
    capturedAt: item?.capturedAt || '',
  };
}

async function buildTrendMap(type, ids, { dataDir, limit = 8 } = {}) {
  const idSet = new Set(ids.filter(Boolean));
  const result = new Map([...idSet].map(id => [id, []]));
  if (idSet.size === 0) return result;

  const currentDataset = await readCurrentDataset(type, { dataDir });
  const titleToCurrentId = new Map();
  for (const item of currentDataset?.items || []) {
    if (!idSet.has(item.id)) continue;
    const titleKey = normalizeTrendTitle(item.title);
    if (titleKey && !titleToCurrentId.has(titleKey)) titleToCurrentId.set(titleKey, item.id);
  }

  const dates = await listSnapshotDates({ dataDir, limit });
  await Promise.all(dates.map(async (date) => {
    const dataset = await readSnapshotDatasetByDate(type, date, { dataDir });
    const seenTargetsForDate = new Set();
    for (const item of dataset?.items || []) {
      const targetId = idSet.has(item.id) ? item.id : titleToCurrentId.get(normalizeTrendTitle(item.title));
      if (!targetId || seenTargetsForDate.has(targetId)) continue;
      const point = normalizeTrendPoint(date, item);
      if (point) {
        result.get(targetId)?.push(point);
        seenTargetsForDate.add(targetId);
      }
    }
  }));

  for (const points of result.values()) {
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return result;
}

async function listHotDatasetContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '', dataDir } = {}) {
  const dataset = await ensureHotDataset(type, { dataDir });
  const filtered = sortItems(dataset.items || [], sort).filter(item => matchesKeyword(item, keyword));
  const { pageNum, limitNum, slice } = paginate(filtered, page, limit);
  const trendMap = await buildTrendMap(type, slice.map(item => item.id), { dataDir });
  return {
    list: slice.map((item, index) => toContent(item, ((pageNum - 1) * limitNum) + index + 1, { trend: trendMap.get(item.id) || [] })),
    pagination: { page: pageNum, limit: limitNum, total: filtered.length },
    sourceChain: ['json_hot_dataset'],
    resolvedSource: 'json_hot_dataset',
    stale: false,
    datasetDate: dataset.date,
    capturedAt: dataset.capturedAt,
  };
}

async function getHotDatasetContentById(contentId, { dataDir } = {}) {
  const [type] = String(contentId || '').split(':');
  ensureType(type);
  const dataset = await ensureHotDataset(type, { dataDir });
  const item = (dataset.items || []).find(entry => entry.id === contentId);
  if (!item) return null;
  const trendMap = await buildTrendMap(type, [item.id], { dataDir });
  const content = toContent(item, item.rank || 0, { trend: trendMap.get(item.id) || [] });
  const datasets = await Promise.all([...VALID_TYPES].map(async relatedType => (
    relatedType === type ? dataset : readCurrentDataset(relatedType, { dataDir })
  )));
  const relatedContents = datasets
    .flatMap(entryDataset => entryDataset?.items || [])
    .filter(entry => entry.id !== item.id && (
      entry.ipName === item.ipName
      || entry.actors?.some(actor => item.actors?.includes(actor))
      || entry.characters?.some(character => item.characters?.includes(character))
      || entry.categories?.some(category => item.categories?.includes(category))
    ))
    .filter((entry, index, list) => list.findIndex(candidate => candidate.id === entry.id) === index)
    .sort((a, b) => (Number(b.metrics?.totalScore) || 0) - (Number(a.metrics?.totalScore) || 0))
    .slice(0, 5)
    .map(entry => toContent(entry, entry.rank || 0));
  return {
    ...content,
    leaderboardEvidence: item.evidence || [],
    relatedContents,
    similarContents: relatedContents,
  };
}

async function listHotDatasetTopicContents({
  field,
  value,
  type = '',
  page = 1,
  limit = 20,
  sort = 'hot',
  dataDir,
} = {}) {
  const normalizedField = String(field || '').trim();
  const normalizedValue = String(value || '').trim().slice(0, MAX_KEYWORD_LENGTH);
  if (!normalizedValue) throw createApiError('invalid_request', 'Topic value is required');
  if (!['actor', 'character', 'author', 'ip', 'category'].includes(normalizedField)) {
    throw createApiError('invalid_request', 'Invalid topic field');
  }

  const types = type ? [type] : [...VALID_TYPES];
  const list = [];
  for (const itemType of types) {
    ensureType(itemType);
    const dataset = await ensureHotDataset(itemType, { dataDir });
    list.push(...(dataset.items || []).filter(item => {
      if (normalizedField === 'actor') return item.actors?.includes(normalizedValue);
      if (normalizedField === 'character') return item.characters?.includes(normalizedValue);
      if (normalizedField === 'author') return item.author === normalizedValue;
      if (normalizedField === 'category') return item.categories?.includes(normalizedValue);
      return (item.ipName || item.title) === normalizedValue;
    }));
  }

  const sorted = sortItems(list, sort);
  const { pageNum, limitNum, slice } = paginate(sorted, page, limit);
  return {
    field: normalizedField,
    value: normalizedValue,
    typeFilter: type || '',
    minHotScore: 0,
    list: slice.map((item, index) => toContent(item, ((pageNum - 1) * limitNum) + index + 1)),
    pagination: { page: pageNum, limit: limitNum, total: sorted.length },
    stale: false,
  };
}

async function getHotDatasetStatus({ dataDir } = {}) {
  const status = [];
  for (const type of VALID_TYPES) {
    const dataset = await readCurrentDataset(type, { dataDir });
    status.push({
      type,
      count: dataset?.items?.length || 0,
      date: dataset?.date || '',
      capturedAt: dataset?.capturedAt || '',
    });
  }
  return {
    types: status,
    indexes: {
      actor: Object.keys(await readIndex('actor', { dataDir })).length,
      ip: Object.keys(await readIndex('ip', { dataDir })).length,
      category: Object.keys(await readIndex('category', { dataDir })).length,
    },
  };
}

async function getHotDatasetPreview({ type = 'drama', limit = 10, dataDir } = {}) {
  ensureType(type);
  const limitNum = normalizePreviewLimit(limit);
  const dataset = await readCurrentDataset(type, { dataDir });
  const logDate = dataset?.date || getTodayKey(new Date());
  const latestLog = await readCrawlLog(logDate, { dataDir });
  const runs = Array.isArray(latestLog.runs)
    ? latestLog.runs.filter(run => !run?.type || run.type === type).slice(-limitNum).reverse()
    : [];

  return {
    type,
    file: `current/${type}.json`,
    exists: Boolean(dataset),
    date: dataset?.date || '',
    capturedAt: dataset?.capturedAt || '',
    count: dataset?.items?.length || 0,
    items: (dataset?.items || []).slice(0, limitNum).map(toPreviewItem),
    latestLog: {
      file: latestLog.date ? `logs/crawl-${latestLog.date}.json` : '',
      date: latestLog.date || '',
      updatedAt: latestLog.updatedAt || '',
      runs,
    },
  };
}

export {
  buildDataset,
  refreshHotDataset,
  listHotDatasetContents,
  getHotDatasetContentById,
  listHotDatasetTopicContents,
  getHotDatasetStatus,
  getHotDatasetPreview,
  rebuildIndexes,
};

