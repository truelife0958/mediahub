import { createApiError } from '../utils/apiErrors.js';
import {
  countCachedContentsByType,
  getCachedContentById,
  listCachedContents,
  listContentQualityStats,
  updateCachedContent,
  upsertContents,
} from '../repositories/contentRepository.js';
import { getSourceStatuses, listSourceRuns } from '../repositories/sourceRepository.js';
import { getAiConfigPublic } from './aiConfigService.js';
import { enrichPublicContent } from './aiEnrichmentService.js';
import { getSourceHealthSnapshot, getSourceRoutingSettingsSnapshot } from './sourceStrategyService.js';
import { invalidateCatalogCacheByType } from './catalogService.js';
import { recordAuditEntry, recordContentRevisionEntry } from './leaderboardService.js';

const CONTENT_TYPES = ['drama', 'novel', 'comic', 'anime'];
const TYPE_LABELS = {
  drama: '短剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};

function ensureType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!CONTENT_TYPES.includes(normalized)) {
    throw createApiError('invalid_request', 'type must be one of drama/novel/comic/anime');
  }
  return normalized;
}

function normalizeStringArray(value, max = 12) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].slice(0, max);
  }
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeHotScore(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

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
  const sourceHealth = getSourceHealthSnapshot();
  const recentRuns = listSourceRuns({ limit: 20 });
  const aiConfig = getAiConfigPublic();
  const successRuns = recentRuns.filter(run => run.status === 'success').length;
  const estimatedPromptTokens = Math.max(0, recentRuns.reduce((sum, run) => sum + (Number(run.count) || 0) * 850, 0));
  const estimatedCostUsd = Number(((estimatedPromptTokens / 1_000_000) * 1.5).toFixed(4));

  return {
    totalContents,
    countsByType,
    sourceStatuses,
    sourceHealth,
    aiConfig,
    routing: getSourceRoutingSettingsSnapshot(),
    quality,
    recentRuns,
    runStats: {
      totalRuns: recentRuns.length,
      successRuns,
      failedRuns: recentRuns.length - successRuns,
      successRate: recentRuns.length ? Math.round((successRuns / recentRuns.length) * 100) : 100,
    },
    cost: {
      estimatedPromptTokens,
      estimatedCostUsd,
      currency: 'USD',
      note: '按入库条数估算，实际以模型服务账单为准。',
    },
  };
}

function listAdminContents({ type = 'anime', page = 1, limit = 12, sort = 'latest', keyword = '' } = {}) {
  const normalizedType = ensureType(type);
  return listCachedContents({
    type: normalizedType,
    page,
    limit,
    sort: sort === 'hot' ? 'hot' : 'latest',
    keyword,
    stale: false,
  });
}

function buildManualContent(payload = {}) {
  const type = ensureType(payload.type);
  const title = String(payload.title || '').trim();
  if (!title) throw createApiError('invalid_request', 'title is required');
  const now = new Date().toISOString();
  const seed = `${type}:manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: String(payload.id || seed).trim(),
    title,
    cover: String(payload.cover || '').trim(),
    summary: String(payload.summary || '').trim(),
    type,
    tags: normalizeStringArray(payload.tags || [], 12),
    actors: normalizeStringArray(payload.actors || [], 12),
    author: String(payload.author || '').trim(),
    ipName: String(payload.ipName || '').trim(),
    status: payload.status === 'ongoing' ? 'ongoing' : 'completed',
    hotScore: normalizeHotScore(payload.hotScore),
    createdAt: String(payload.createdAt || now),
    updatedAt: String(payload.updatedAt || now),
    source: {
      provider: 'manual',
      label: 'Manual Admin Entry',
      url: String(payload.sourceUrl || payload.url || '').trim(),
    },
  };
}

function createAdminContent(payload = {}) {
  const content = buildManualContent(payload);
  upsertContents([content]);
  invalidateCatalogCacheByType(content.type);
  const created = getCachedContentById(content.id, { stale: false });
  if (!created) throw createApiError('upstream_unavailable', 'Content create failed');

  recordContentRevisionEntry({
    contentId: created.id,
    action: 'create',
    actor: 'admin',
    before: {},
    patch: content,
    after: created,
  });
  recordAuditEntry({
    action: 'content.create',
    entityType: 'content',
    entityId: created.id,
    actor: 'admin',
    details: { type: created.type, title: created.title, hotScore: created.hotScore },
  });
  return created;
}

function updateAdminContent(contentId, payload = {}) {
  const current = getCachedContentById(contentId, { stale: false });
  if (!current) {
    throw createApiError('not_found', 'Content not found');
  }

  const patch = {};
  if ('title' in payload) patch.title = String(payload.title || '').trim() || current.title;
  if ('summary' in payload) patch.summary = String(payload.summary || '').trim();
  if ('author' in payload) patch.author = String(payload.author || '').trim();
  if ('ipName' in payload) patch.ipName = String(payload.ipName || '').trim();
  if ('status' in payload) patch.status = payload.status === 'ongoing' ? 'ongoing' : 'completed';
  if ('hotScore' in payload) patch.hotScore = normalizeHotScore(payload.hotScore);
  if ('tags' in payload) patch.tags = normalizeStringArray(payload.tags, 12);
  if ('actors' in payload) patch.actors = normalizeStringArray(payload.actors, 12);

  const updated = updateCachedContent(contentId, patch);
  if (!updated) throw createApiError('not_found', 'Content not found');
  invalidateCatalogCacheByType(updated.type);

  recordContentRevisionEntry({
    contentId: updated.id,
    action: 'update',
    actor: 'admin',
    before: current,
    patch,
    after: updated,
  });
  recordAuditEntry({
    action: 'content.update',
    entityType: 'content',
    entityId: updated.id,
    actor: 'admin',
    details: { patchKeys: Object.keys(patch), type: updated.type, title: updated.title },
  });
  return updated;
}

function needsText(value, min = 8) {
  return !String(value || '').trim() || String(value || '').trim().length < min;
}

async function fillMissingAdminContentWithAi(contentId) {
  const current = getCachedContentById(contentId, { stale: false });
  if (!current) throw createApiError('not_found', 'Content not found');

  const contextText = [
    current.title,
    current.summary,
    current.ipName,
    ...(current.tags || []),
    ...(current.actors || []),
  ].filter(Boolean).join('。');

  const enriched = await enrichPublicContent({
    title: current.title,
    text: contextText.length >= 40
      ? contextText
      : `${current.title} 是 MediaHub 后台补录内容，需要补齐简介、标签、作者、IP 名、状态和热度。`,
    type: current.type,
    sourceUrl: current.source?.url || '',
    base: current,
  });

  const patch = {};
  if (needsText(current.summary)) patch.summary = enriched.summary;
  if (!Array.isArray(current.tags) || current.tags.length === 0) patch.tags = enriched.tags;
  if (!Array.isArray(current.actors) || current.actors.length === 0) patch.actors = enriched.actors;
  if (!String(current.author || '').trim()) patch.author = enriched.author;
  if (!String(current.ipName || '').trim() || current.ipName === current.title) patch.ipName = enriched.ipName;
  if (!current.hotScore || current.hotScore < 100) patch.hotScore = enriched.hotScore;
  if (current.status !== 'ongoing' && enriched.status) patch.status = enriched.status;

  const updated = updateCachedContent(contentId, patch);
  if (!updated) throw createApiError('not_found', 'Content not found');
  invalidateCatalogCacheByType(updated.type);

  recordContentRevisionEntry({
    contentId: updated.id,
    action: 'fill-missing',
    actor: 'admin',
    before: current,
    patch,
    after: updated,
  });
  recordAuditEntry({
    action: 'content.fill-missing',
    entityType: 'content',
    entityId: updated.id,
    actor: 'admin',
    details: { patchKeys: Object.keys(patch), type: updated.type, title: updated.title },
  });
  return updated;
}

function getAdminQuality() {
  return listContentQualityStats();
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

export {
  CONTENT_TYPES,
  TYPE_LABELS,
  buildAdminSummary,
  listAdminContents,
  createAdminContent,
  updateAdminContent,
  fillMissingAdminContentWithAi,
  getAdminQuality,
  getAdminLogs,
};
