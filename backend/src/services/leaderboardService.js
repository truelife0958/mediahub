import { createApiError } from '../utils/apiErrors.js';
import { listCachedContents } from '../repositories/contentRepository.js';
import { dispatchSubscriptionNotifications } from './notificationService.js';
import { getSourceHealthSnapshot } from './sourceStrategyService.js';
import { getSystemSettingsSnapshot } from './systemSettingsService.js';
import {
  CONTENT_TYPES,
  LAYERS,
  buildLayerContents,
  captureLeaderboardSnapshot,
  createKeywordSubscription,
  deleteKeywordSubscription,
  exportLeaderboardAsCsv,
  getKeywordSubscriptionById,
  getLatestSnapshot,
  getLeaderboardDelta,
  getLeaderboardLayerConfig,
  getLeaderboardTrend,
  listAuditLogs,
  listContentRevisions,
  listKeywordSubscriptions,
  listLeaderboardEvents,
  listSubscriptionHits,
  recordAuditLog,
  recordContentRevision,
  updateKeywordSubscription,
} from '../repositories/leaderboardRepository.js';

function ensureType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!CONTENT_TYPES.includes(normalized)) {
    throw createApiError('invalid_request', 'type must be one of drama/novel/comic/anime');
  }
  return normalized;
}

function ensureLayer(layer) {
  const normalized = String(layer || 'overall').trim().toLowerCase();
  if (!LAYERS.includes(normalized)) {
    throw createApiError('invalid_request', 'layer must be one of overall/new/rising/completed');
  }
  return normalized;
}

function parseLimit(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getSnapshotStaleThresholdMs() {
  const settings = getSystemSettingsSnapshot();
  const autoRefresh = settings?.autoRefresh || {};

  if (!autoRefresh.enabled) return 12 * 60 * 60 * 1000;
  if (autoRefresh.mode === 'interval') {
    const minutes = Math.max(30, Number(autoRefresh.intervalMinutes) * 4 || 40);
    return minutes * 60 * 1000;
  }
  return 30 * 60 * 60 * 1000;
}

function severityRank(severity) {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function buildLeaderboardByType({ type, layer = 'overall', limit = 50 } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const limitNum = parseLimit(limit, 50, 1, 200);

  const cached = listCachedContents({
    type: normalizedType,
    page: 1,
    limit: 200,
    sort: 'hot',
    keyword: '',
    stale: false,
  });

  const list = buildLayerContents(cached.list, normalizedLayer, limitNum);
  return {
    type: normalizedType,
    layer: normalizedLayer,
    list,
    total: list.length,
  };
}

async function captureLeaderboardForType({
  type,
  actor = 'system',
  requestId = '',
  layers = ['overall', 'new', 'rising', 'completed'],
  notifySubscriptions = true,
} = {}) {
  const normalizedType = ensureType(type);
  const targetLayers = [...new Set((Array.isArray(layers) ? layers : [layers]).map(ensureLayer))];
  const captures = [];

  for (const layer of targetLayers) {
    const payload = buildLeaderboardByType({ type: normalizedType, layer, limit: 50 });
    const captured = captureLeaderboardSnapshot({
      type: normalizedType,
      layer,
      contents: payload.list,
      capturedAt: new Date().toISOString(),
    });
    captures.push(captured);

    if (notifySubscriptions && captured.subscriptionHits.length > 0) {
      const subscriptions = listKeywordSubscriptions({ enabled: true })
        .filter(item => !item.type || item.type === normalizedType);

      for (const subscription of subscriptions) {
        const hits = captured.subscriptionHits.filter(item => item.subscriptionId === subscription.id);
        if (hits.length === 0) continue;

        try {
          await dispatchSubscriptionNotifications({
            subscription,
            hits,
            captureId: captured.captureId,
            layer,
          });
        } catch (error) {
          recordAuditLog({
            action: 'subscription.notify.failed',
            entityType: 'keyword_subscription',
            entityId: String(subscription.id),
            actor,
            requestId,
            details: {
              type: normalizedType,
              layer,
              captureId: captured.captureId,
              target: subscription.target || '',
              error: error?.message || 'notify failed',
            },
          });
        }
      }
    }

    recordAuditLog({
      action: 'leaderboard.capture',
      entityType: 'leaderboard_snapshot',
      entityId: captured.captureId,
      actor,
      requestId,
      details: {
        type: normalizedType,
        layer,
        count: captured.count,
        events: captured.events.length,
        subscriptionHits: captured.subscriptionHits.length,
      },
    });
  }

  return {
    type: normalizedType,
    captures,
  };
}

async function captureLeaderboardForAllTypes({
  actor = 'system',
  requestId = '',
  layers = ['overall', 'new', 'rising', 'completed'],
  notifySubscriptions = true,
} = {}) {
  const results = [];
  for (const type of CONTENT_TYPES) {
    results.push(await captureLeaderboardForType({ type, actor, requestId, layers, notifySubscriptions }));
  }
  return results;
}

async function getLeaderboard({ type, layer = 'overall' } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const latest = getLatestSnapshot({ type: normalizedType, layer: normalizedLayer });

  if (latest.list.length > 0) {
    return {
      type: normalizedType,
      layer: normalizedLayer,
      captureId: latest.captureId,
      list: latest.list,
      total: latest.list.length,
      stale: false,
    };
  }

  const captured = await captureLeaderboardForType({
    type: normalizedType,
    layers: [normalizedLayer],
    notifySubscriptions: false,
  });
  const first = captured.captures[0] || null;
  const refreshed = getLatestSnapshot({ type: normalizedType, layer: normalizedLayer });

  return {
    type: normalizedType,
    layer: normalizedLayer,
    captureId: first?.captureId || refreshed.captureId,
    list: refreshed.list,
    total: refreshed.list.length,
    stale: false,
  };
}

function getLeaderboardTrends({ type, layer = 'overall', contentId = '', limit = 20 } = {}) {
  return {
    type: ensureType(type),
    layer: ensureLayer(layer),
    timeline: getLeaderboardTrend({ type, layer, contentId, limit: parseLimit(limit, 20, 2, 120) }),
  };
}

function getLeaderboardDiff({ type, layer = 'overall', baseCaptureId = '', compareCaptureId = '' } = {}) {
  return {
    type: ensureType(type),
    layer: ensureLayer(layer),
    ...getLeaderboardDelta({ type, layer, baseCaptureId, compareCaptureId }),
  };
}

function getLeaderboardAlerts({ type = '', layer = '', eventType = '', limit = 100 } = {}) {
  const args = {
    limit: parseLimit(limit, 100, 1, 500),
  };
  if (String(type || '').trim()) args.type = ensureType(type);
  if (String(layer || '').trim()) args.layer = ensureLayer(layer);
  if (String(eventType || '').trim()) args.eventType = String(eventType).trim();

  return {
    events: listLeaderboardEvents(args),
  };
}

function getLeaderboardAnomalies({ type = '', layer = '' } = {}) {
  const targetTypes = String(type || '').trim() ? [ensureType(type)] : CONTENT_TYPES;
  const targetLayers = String(layer || '').trim() ? [ensureLayer(layer)] : LAYERS;
  const staleThresholdMs = getSnapshotStaleThresholdMs();
  const detectedAt = new Date().toISOString();
  const list = [];

  for (const currentType of targetTypes) {
    for (const currentLayer of targetLayers) {
      const latest = getLatestSnapshot({ type: currentType, layer: currentLayer });
      if (!latest.captureId || latest.list.length === 0) {
        list.push({
          code: 'missing_snapshot',
          severity: 'high',
          type: currentType,
          layer: currentLayer,
          source: '',
          message: `${currentType}/${currentLayer} 暂无榜单快照`,
          detail: {},
          detectedAt,
        });
        continue;
      }

      const capturedAt = latest.list[0]?.capturedAt || '';
      const capturedTs = Date.parse(capturedAt);
      if (Number.isFinite(capturedTs)) {
        const ageMs = Date.now() - capturedTs;
        if (ageMs > staleThresholdMs) {
          list.push({
            code: 'stale_snapshot',
            severity: 'high',
            type: currentType,
            layer: currentLayer,
            source: '',
            message: `${currentType}/${currentLayer} 快照已过期`,
            detail: { capturedAt, ageMs, staleThresholdMs },
            detectedAt,
          });
        }
      }

      if (latest.list.length < 5) {
        list.push({
          code: 'small_snapshot',
          severity: latest.list.length <= 2 ? 'high' : 'medium',
          type: currentType,
          layer: currentLayer,
          source: '',
          message: `${currentType}/${currentLayer} 榜单条目过少，仅 ${latest.list.length} 条`,
          detail: { count: latest.list.length },
          detectedAt,
        });
      }

      const zeroHotScoreCount = latest.list.filter(item => Number(item.hotScore) <= 0).length;
      if (zeroHotScoreCount > 0) {
        list.push({
          code: 'zero_hot_score',
          severity: 'medium',
          type: currentType,
          layer: currentLayer,
          source: '',
          message: `${currentType}/${currentLayer} 存在 ${zeroHotScoreCount} 条热度为 0 的内容`,
          detail: { count: zeroHotScoreCount, captureId: latest.captureId },
          detectedAt,
        });
      }
    }
  }

  const sourceHealth = getSourceHealthSnapshot();
  sourceHealth
    .filter(item => targetTypes.includes(item.type))
    .forEach((item) => {
      if (Number(item.consecutiveFailures) < 3) return;
      list.push({
        code: 'source_consecutive_failures',
        severity: Number(item.consecutiveFailures) >= 5 ? 'high' : 'medium',
        type: item.type,
        layer: '',
        source: item.source,
        message: `${item.type} 源 ${item.source} 已连续失败 ${item.consecutiveFailures} 次`,
        detail: {
          consecutiveFailures: item.consecutiveFailures,
          lastStatus: item.lastStatus,
          lastError: item.lastError,
          score: item.score,
        },
        detectedAt,
      });
    });

  list.sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.layer !== b.layer) return String(a.layer || '').localeCompare(String(b.layer || ''));
    return a.code.localeCompare(b.code);
  });

  return {
    staleThresholdMs,
    list,
  };
}

async function exportLeaderboard({ type, layer = 'overall', captureId = '', format = 'csv' } = {}) {
  const normalizedFormat = String(format || 'csv').trim().toLowerCase();
  if (normalizedFormat !== 'csv' && normalizedFormat !== 'json') {
    throw createApiError('invalid_request', 'format must be csv or json');
  }

  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);

  if (normalizedFormat === 'csv') {
    return exportLeaderboardAsCsv({ type: normalizedType, layer: normalizedLayer, captureId });
  }

  const snapshot = await getLeaderboard({ type: normalizedType, layer: normalizedLayer });
  return {
    type: normalizedType,
    layer: normalizedLayer,
    captureId: snapshot.captureId,
    json: snapshot.list,
  };
}

function getLayerConfig() {
  return getLeaderboardLayerConfig();
}

function createSubscription(payload = {}, { actor = 'admin', requestId = '' } = {}) {
  try {
    const id = createKeywordSubscription(payload || {});
    const created = getKeywordSubscriptionById(id);
    recordAuditLog({
      action: 'subscription.create',
      entityType: 'keyword_subscription',
      entityId: String(id),
      actor,
      requestId,
      details: created || {},
    });
    return created;
  } catch (error) {
    throw createApiError('invalid_request', error.message || 'create subscription failed');
  }
}

function updateSubscription(id, patch = {}, { actor = 'admin', requestId = '' } = {}) {
  try {
    const updated = updateKeywordSubscription(id, patch || {});
    if (!updated) throw createApiError('not_found', 'subscription not found');
    recordAuditLog({
      action: 'subscription.update',
      entityType: 'keyword_subscription',
      entityId: String(id),
      actor,
      requestId,
      details: updated,
    });
    return updated;
  } catch (error) {
    if (error?.publicCode) throw error;
    throw createApiError('invalid_request', error.message || 'update subscription failed');
  }
}

function removeSubscription(id, { actor = 'admin', requestId = '' } = {}) {
  const existed = getKeywordSubscriptionById(id);
  const ok = deleteKeywordSubscription(id);
  if (!ok) throw createApiError('not_found', 'subscription not found');
  recordAuditLog({
    action: 'subscription.delete',
    entityType: 'keyword_subscription',
    entityId: String(id),
    actor,
    requestId,
    details: existed || {},
  });
  return { deleted: true, id: Number(id) || 0 };
}

function listSubscriptions({ type = '', enabled } = {}) {
  const args = {};
  if (String(type || '').trim()) args.type = ensureType(type);
  if (enabled !== undefined) args.enabled = enabled;
  return { list: listKeywordSubscriptions(args) };
}

function listSubscriptionAlertHits({ type = '', keyword = '', limit = 100 } = {}) {
  const args = {
    keyword,
    limit: parseLimit(limit, 100, 1, 500),
  };
  if (String(type || '').trim()) args.type = ensureType(type);
  return {
    list: listSubscriptionHits(args),
  };
}

function listAuditRecords({ action = '', entityType = '', limit = 100 } = {}) {
  return {
    list: listAuditLogs({
      action: String(action || '').trim(),
      entityType: String(entityType || '').trim(),
      limit: parseLimit(limit, 100, 1, 500),
    }),
  };
}

function listRevisions(contentId, { limit = 50 } = {}) {
  if (!String(contentId || '').trim()) {
    throw createApiError('invalid_request', 'contentId is required');
  }
  return {
    list: listContentRevisions(String(contentId).trim(), { limit: parseLimit(limit, 50, 1, 200) }),
  };
}

function recordContentRevisionEntry(payload) {
  recordContentRevision(payload);
}

function recordAuditEntry(payload) {
  recordAuditLog(payload);
}

export {
  CONTENT_TYPES,
  captureLeaderboardForAllTypes,
  captureLeaderboardForType,
  createSubscription,
  exportLeaderboard,
  getLayerConfig,
  getLeaderboard,
  getLeaderboardAlerts,
  getLeaderboardAnomalies,
  getLeaderboardDiff,
  getLeaderboardTrends,
  listAuditRecords,
  listRevisions,
  listSubscriptionAlertHits,
  listSubscriptions,
  recordAuditEntry,
  recordContentRevisionEntry,
  removeSubscription,
  updateSubscription,
};
