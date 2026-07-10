import {
  countCachedContentsByType,
  listContentQualityStats,
} from '../repositories/contentRepository.js';
import { getSourceStatuses, listSourceRuns } from '../repositories/sourceRepository.js';
import { getHotDatasetPreview, getHotDatasetStatus } from './hotDatasetService.js';
import { readCurrentDataset } from '../store/jsonStore.js';
import { isDatabaseDisabled } from '../db/database.js';

const CONTENT_TYPES = ['drama', 'novel', 'anime', 'comic'];
const TYPE_LABELS = {
  drama: '短剧',
  novel: '小说',
  anime: '动漫',
  comic: '漫画',
};

function classifyRun(run) {
  if (run.status === 'success') return '成功';
  const text = String(run.error || '').toLowerCase();
  if (/timeout|超时|abort/.test(text)) return '超时';
  if (/rate|429|限流/.test(text)) return '限流';
  if (/api key|unauthorized|401|403|鉴权|密钥/.test(text)) return '鉴权';
  return '失败';
}

function buildAdminSummary() {
  const countsByType = Object.fromEntries(CONTENT_TYPES.map(type => [type, countCachedContentsByType(type)]));
  const totalContents = Object.values(countsByType).reduce((sum, count) => sum + count, 0);
  const quality = listContentQualityStats();
  const sourceStatuses = getSourceStatuses();
  const recentRuns = listSourceRuns({ limit: 20 });
  const successRuns = recentRuns.filter(run => run.status === 'success').length;

  return {
    totalContents,
    countsByType,
    sourceStatuses,
    quality,
    recentRuns,
    runStats: {
      totalRuns: recentRuns.length,
      successRuns,
      failedRuns: recentRuns.length - successRuns,
      successRate: recentRuns.length ? Math.round((successRuns / recentRuns.length) * 100) : 100,
    },
  };
}

async function readJsonOnlyItems() {
  const entries = await Promise.all(CONTENT_TYPES.map(async (type) => {
    const dataset = await readCurrentDataset(type).catch(() => null);
    return [type, Array.isArray(dataset?.items) ? dataset.items : []];
  }));
  return Object.fromEntries(entries);
}

function calculateJsonOnlyQuality(itemsByType) {
  const byType = CONTENT_TYPES.map((type) => {
    const list = itemsByType[type] || [];
    return {
      type,
      total: list.length,
      missingCover: list.filter(item => !String(item.cover || '').trim()).length,
      missingSummary: list.filter(item => !String(item.summary || '').trim()).length,
      missingTags: list.filter(item => !Array.isArray(item.categories) || item.categories.length === 0).length,
      lowHotScore: list.filter(item => Number(item.metrics?.totalScore || item.hotScore || 0) <= 0).length,
    };
  });

  const total = byType.reduce((sum, row) => sum + row.total, 0);
  const missingCover = byType.reduce((sum, row) => sum + row.missingCover, 0);
  const missingSummary = byType.reduce((sum, row) => sum + row.missingSummary, 0);
  const missingTags = byType.reduce((sum, row) => sum + row.missingTags, 0);
  const lowHotScore = byType.reduce((sum, row) => sum + row.lowHotScore, 0);
  const issueCount = missingSummary + missingTags + lowHotScore;
  const qualityScore = total > 0 ? Math.max(0, Math.round(100 - (issueCount / total) * 20)) : 100;

  return {
    total,
    missingCover,
    missingSummary,
    missingTags,
    lowHotScore,
    qualityScore,
    byType,
    duplicateCandidates: [],
    boundaryRisks: [],
    reviewQueue: [],
  };
}

async function buildJsonOnlyAdminQuality() {
  return calculateJsonOnlyQuality(await readJsonOnlyItems());
}

async function buildJsonOnlyAdminLogs({ limit = 50 } = {}) {
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const previews = await Promise.all(CONTENT_TYPES.map(type => getHotDatasetPreview({ type, limit: limitNum }).catch(() => null)));
  const runs = previews.flatMap(preview => preview?.latestLog?.runs || [])
    .sort((a, b) => Date.parse(b.finishedAt || b.startedAt || '') - Date.parse(a.finishedAt || a.startedAt || ''))
    .slice(0, limitNum)
    .map((run, index) => ({
      id: index + 1,
      type: run.type,
      source: run.source || 'json_hot_dataset',
      status: run.status || 'success',
      count: Number(run.count) || 0,
      error: run.error || run.warning || null,
      startedAt: run.startedAt || '',
      finishedAt: run.finishedAt || run.startedAt || '',
      category: classifyRun(run),
    }));

  return {
    runs,
    errorSummary: runs.reduce((acc, run) => {
      const key = run.category || classifyRun(run);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function buildJsonOnlyAdminSummary() {
  const [status, quality, logs] = await Promise.all([
    getHotDatasetStatus(),
    buildJsonOnlyAdminQuality(),
    buildJsonOnlyAdminLogs({ limit: 20 }),
  ]);
  const countsByType = Object.fromEntries(CONTENT_TYPES.map((type) => {
    const entry = status.types.find(item => item.type === type);
    return [type, entry?.count || 0];
  }));
  const totalContents = Object.values(countsByType).reduce((sum, count) => sum + count, 0);
  const successRuns = logs.runs.filter(run => run.status === 'success').length;

  return {
    totalContents,
    countsByType,
    sourceStatuses: [],
    quality,
    recentRuns: logs.runs,
    runStats: {
      totalRuns: logs.runs.length,
      successRuns,
      failedRuns: logs.runs.length - successRuns,
      successRate: logs.runs.length ? Math.round((successRuns / logs.runs.length) * 100) : 100,
    },
  };
}

async function resolveAdminSummary() {
  return isDatabaseDisabled() ? buildJsonOnlyAdminSummary() : buildAdminSummary();
}

function getAdminQuality() {
  return listContentQualityStats();
}

async function resolveAdminQuality() {
  return isDatabaseDisabled() ? buildJsonOnlyAdminQuality() : getAdminQuality();
}

function getAdminLogs({ limit = 50 } = {}) {
  const runs = listSourceRuns({ limit });
  return {
    runs: runs.map(run => ({ ...run, category: classifyRun(run) })),
    errorSummary: runs.reduce((acc, run) => {
      const key = classifyRun(run);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function resolveAdminLogs({ limit = 50 } = {}) {
  return isDatabaseDisabled() ? buildJsonOnlyAdminLogs({ limit }) : getAdminLogs({ limit });
}

export {
  CONTENT_TYPES,
  TYPE_LABELS,
  buildAdminSummary,
  resolveAdminSummary,
  getAdminQuality,
  resolveAdminQuality,
  getAdminLogs,
  resolveAdminLogs,
};
