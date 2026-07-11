import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { createApiError } from '../utils/apiErrors.js';
import { CONTENT_TYPES } from '../constants/contentTypes.js';

const LAYERS = ['overall', 'new', 'rising', 'completed'];

function ensureType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!CONTENT_TYPES.includes(normalized)) throw createApiError('invalid_request', 'type must be one of drama/novel/anime/comic');
  return normalized;
}

function ensureLayer(layer) {
  const normalized = String(layer || 'overall').trim().toLowerCase();
  if (!LAYERS.includes(normalized)) throw createApiError('invalid_request', 'layer must be one of overall/new/rising/completed');
  return normalized;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serialize(value) {
  return JSON.stringify(value ?? {});
}

function normalizeKeyword(value) {
  return String(value || '').trim().toLowerCase();
}

function buildDefaultEvidence(item) {
  return {
    source: item?.source?.provider || 'unknown',
    sourceLabel: item?.source?.label || 'unknown',
    sourceUrl: item?.source?.url || '',
    updatedAt: item?.updatedAt || item?.createdAt || '',
  };
}

function toSnapshotRow(row) {
  return {
    captureId: row.capture_id,
    type: row.type,
    layer: row.layer,
    rank: Number(row.rank) || 0,
    contentId: row.content_id,
    title: row.title,
    hotScore: Number(row.hot_score) || 0,
    heatMetric: row.heat_metric || 'playback',
    status: row.status || 'completed',
    tags: parseJson(row.tags_json, []),
    sourceUrl: row.source_url || '',
    evidence: parseJson(row.evidence_json, {}),
    capturedAt: row.captured_at,
  };
}

function toEventRow(row) {
  return {
    id: Number(row.id) || 0,
    type: row.type,
    layer: row.layer,
    eventType: row.event_type,
    contentId: row.content_id,
    title: row.title,
    prevRank: row.prev_rank === null || row.prev_rank === undefined ? null : Number(row.prev_rank),
    newRank: row.new_rank === null || row.new_rank === undefined ? null : Number(row.new_rank),
    rankDelta: row.rank_delta === null || row.rank_delta === undefined ? null : Number(row.rank_delta),
    prevHotScore: row.prev_hot_score === null || row.prev_hot_score === undefined ? null : Number(row.prev_hot_score),
    newHotScore: row.new_hot_score === null || row.new_hot_score === undefined ? null : Number(row.new_hot_score),
    message: row.message,
    details: parseJson(row.details_json, {}),
    capturedAt: row.captured_at,
  };
}

function buildLayerContents(contents = [], layer = 'overall', limit = 50) {
  const normalizedLayer = ensureLayer(layer);
  const list = Array.isArray(contents) ? contents : [];

  let filtered = list;
  if (normalizedLayer === 'new') {
    filtered = list
      .filter(item => {
        const ts = Date.parse(String(item?.createdAt || item?.updatedAt || ''));
        if (!Number.isFinite(ts)) return false;
        return Date.now() - ts <= 7 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const tsA = Date.parse(String(a?.createdAt || a?.updatedAt || ''));
        const tsB = Date.parse(String(b?.createdAt || b?.updatedAt || ''));
        return tsB - tsA;
      });
  } else if (normalizedLayer === 'completed') {
    filtered = list.filter(item => String(item?.status || '').toLowerCase() === 'completed');
  } else if (normalizedLayer === 'rising') {
    filtered = list
      .map(item => {
        const hot = Number(item?.hotScore) || 0;
        const updatedTs = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
        const freshness = Number.isFinite(updatedTs)
          ? Math.max(0, 30 - Math.floor((Date.now() - updatedTs) / (24 * 60 * 60 * 1000)))
          : 0;
        const risingScore = hot + freshness * 1_000;
        return { item, risingScore };
      })
      .sort((a, b) => b.risingScore - a.risingScore)
      .map(entry => entry.item);
  }

  return filtered.slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
}

function getLatestCaptureId({ type, layer }) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT capture_id
    FROM leaderboard_snapshots
    WHERE type = ? AND layer = ?
    ORDER BY captured_at DESC
    LIMIT 1
  `).get(ensureType(type), ensureLayer(layer));
  return row?.capture_id || null;
}

function getSnapshotByCaptureId(captureId) {
  if (!captureId) return [];
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT *
    FROM leaderboard_snapshots
    WHERE capture_id = ?
    ORDER BY rank ASC
  `).all(String(captureId));
  return rows.map(toSnapshotRow);
}

function getLatestSnapshot({ type, layer = 'overall' }) {
  const captureId = getLatestCaptureId({ type, layer });
  if (!captureId) return { captureId: null, list: [] };
  return { captureId, list: getSnapshotByCaptureId(captureId) };
}

function listSnapshotsByContentId(contentId, { limit = 12 } = {}) {
  const normalizedContentId = String(contentId || '').trim();
  if (!normalizedContentId) return [];
  const db = getDatabase();
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 12));
  const rows = db.prepare(`
    SELECT *
    FROM leaderboard_snapshots
    WHERE content_id = ?
    ORDER BY captured_at DESC, rank ASC
    LIMIT ?
  `).all(normalizedContentId, limitNum);

  return rows.map(toSnapshotRow);
}

function recordAuditLog({ action, entityType, entityId = '', actor = 'admin', requestId = '', details = {} }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, actor, request_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(action || '').trim() || 'unknown',
    String(entityType || '').trim() || 'system',
    String(entityId || '').trim(),
    String(actor || 'admin').trim() || 'admin',
    String(requestId || '').trim(),
    serialize(details || {}),
    now,
  );
}

function listAuditLogs({ action = '', entityType = '', limit = 100 } = {}) {
  const db = getDatabase();
  const limitNum = Math.max(1, Math.min(500, Number(limit) || 100));
  const where = [];
  const params = [];
  if (String(action || '').trim()) {
    where.push('action = ?');
    params.push(String(action).trim());
  }
  if (String(entityType || '').trim()) {
    where.push('entity_type = ?');
    params.push(String(entityType).trim());
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT *
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(...params, limitNum);

  return rows.map(row => ({
    id: Number(row.id) || 0,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || '',
    actor: row.actor || 'admin',
    requestId: row.request_id || '',
    details: parseJson(row.details_json, {}),
    createdAt: row.created_at,
  }));
}

function recordContentRevision({ contentId, action, actor = 'admin', before = {}, patch = {}, after = {} }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO content_revisions (content_id, action, actor, before_json, patch_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(contentId || '').trim(),
    String(action || '').trim() || 'update',
    String(actor || 'admin').trim() || 'admin',
    serialize(before || {}),
    serialize(patch || {}),
    serialize(after || {}),
    now,
  );
}

function listContentRevisions(contentId, { limit = 50 } = {}) {
  const db = getDatabase();
  const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = db.prepare(`
    SELECT *
    FROM content_revisions
    WHERE content_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(String(contentId || '').trim(), limitNum);

  return rows.map(row => ({
    id: Number(row.id) || 0,
    contentId: row.content_id,
    action: row.action,
    actor: row.actor,
    before: parseJson(row.before_json, {}),
    patch: parseJson(row.patch_json, {}),
    after: parseJson(row.after_json, {}),
    createdAt: row.created_at,
  }));
}

function createKeywordSubscription({ keyword, type = '', channel = 'internal', target = '' }) {
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword) throw new Error('keyword required');
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType && !CONTENT_TYPES.includes(normalizedType)) throw new Error('invalid type');

  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO keyword_subscriptions (keyword, type, channel, target, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(
    normalizedKeyword,
    normalizedType || null,
    String(channel || 'internal').trim() || 'internal',
    String(target || '').trim() || null,
    now,
    now,
  );

  return Number(result?.lastInsertRowid) || 0;
}

function updateKeywordSubscription(id, patch = {}) {
  const subId = Number(id) || 0;
  if (!subId) return null;
  const db = getDatabase();
  const current = db.prepare('SELECT * FROM keyword_subscriptions WHERE id = ?').get(subId);
  if (!current) return null;

  const next = {
    keyword: String(patch.keyword ?? current.keyword).trim(),
    type: String(patch.type ?? current.type ?? '').trim().toLowerCase(),
    channel: String(patch.channel ?? current.channel ?? 'internal').trim() || 'internal',
    target: String(patch.target ?? current.target ?? '').trim(),
    enabled: patch.enabled === undefined ? Number(current.enabled) === 1 : Boolean(patch.enabled),
  };

  if (!next.keyword) throw new Error('keyword required');
  if (next.type && !CONTENT_TYPES.includes(next.type)) throw new Error('invalid type');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE keyword_subscriptions
    SET keyword = ?, type = ?, channel = ?, target = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.keyword,
    next.type || null,
    next.channel,
    next.target || null,
    next.enabled ? 1 : 0,
    now,
    subId,
  );

  return getKeywordSubscriptionById(subId);
}

function deleteKeywordSubscription(id) {
  const subId = Number(id) || 0;
  if (!subId) return false;
  const db = getDatabase();
  const result = db.prepare('DELETE FROM keyword_subscriptions WHERE id = ?').run(subId);
  return Number(result?.changes || 0) > 0;
}

function getKeywordSubscriptionById(id) {
  const subId = Number(id) || 0;
  if (!subId) return null;
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM keyword_subscriptions WHERE id = ?').get(subId);
  if (!row) return null;
  return {
    id: Number(row.id) || 0,
    keyword: row.keyword,
    type: row.type || '',
    channel: row.channel || 'internal',
    target: row.target || '',
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listKeywordSubscriptions({ type = '', enabled } = {}) {
  const db = getDatabase();
  const where = [];
  const params = [];

  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType) {
    where.push('type = ?');
    params.push(normalizedType);
  }
  if (enabled !== undefined) {
    where.push('enabled = ?');
    params.push(Boolean(enabled) ? 1 : 0);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT *
    FROM keyword_subscriptions
    ${whereClause}
    ORDER BY updated_at DESC, id DESC
  `).all(...params);

  return rows.map(row => ({
    id: Number(row.id) || 0,
    keyword: row.keyword,
    type: row.type || '',
    channel: row.channel || 'internal',
    target: row.target || '',
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function listSubscriptionHits({ type = '', keyword = '', limit = 100 } = {}) {
  const db = getDatabase();
  const where = [];
  const params = [];
  const normalizedType = String(type || '').trim().toLowerCase();
  const normalizedKeyword = normalizeKeyword(keyword);

  if (normalizedType) {
    where.push('h.type = ?');
    params.push(normalizedType);
  }
  if (normalizedKeyword) {
    where.push('lower(s.keyword) = ?');
    params.push(normalizedKeyword);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitNum = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = db.prepare(`
    SELECT h.*, s.keyword
    FROM keyword_subscription_hits h
    JOIN keyword_subscriptions s ON s.id = h.subscription_id
    ${whereClause}
    ORDER BY h.captured_at DESC, h.id DESC
    LIMIT ?
  `).all(...params, limitNum);

  return rows.map(row => ({
    id: Number(row.id) || 0,
    subscriptionId: Number(row.subscription_id) || 0,
    captureId: row.capture_id || '',
    keyword: row.keyword,
    type: row.type,
    contentId: row.content_id,
    title: row.title,
    matchedField: row.matched_field,
    details: parseJson(row.details_json, {}),
    capturedAt: row.captured_at,
  }));
}

function recordSubscriptionHits({ type, contents = [], capturedAt = new Date().toISOString(), captureId = '' }) {
  const normalizedType = ensureType(type);
  const list = Array.isArray(contents) ? contents : [];
  if (list.length === 0) return [];

  const subscriptions = listKeywordSubscriptions({ enabled: true }).filter(item => !item.type || item.type === normalizedType);
  if (subscriptions.length === 0) return [];

  const db = getDatabase();
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO keyword_subscription_hits (
      subscription_id, capture_id, type, content_id, title, matched_field, details_json, captured_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const created = [];

  db.exec('BEGIN');
  try {
    for (const sub of subscriptions) {
      const keyword = normalizeKeyword(sub.keyword);
      if (!keyword) continue;

      for (const item of list) {
        const title = String(item?.title || '').trim();
        const ipName = String(item?.ipName || '').trim();
        const author = String(item?.author || '').trim();
        const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
        const summary = String(item?.summary || '').trim();

        const fields = [
          ['title', title],
          ['ipName', ipName],
          ['author', author],
          ['tags', tags],
          ['summary', summary],
        ];

        let matchedField = '';
        for (const [fieldName, fieldValue] of fields) {
          if (normalizeKeyword(fieldValue).includes(keyword)) {
            matchedField = String(fieldName);
            break;
          }
        }
        if (!matchedField) continue;

        const details = {
          hotScore: Number(item?.hotScore) || 0,
          heatMetric: item?.heatMetric || 'playback',
          source: item?.source?.provider || 'unknown',
          sourceUrl: item?.source?.url || '',
        };

        const insertResult = insertStmt.run(
          sub.id,
          String(captureId || '').trim(),
          normalizedType,
          String(item?.id || '').trim(),
          title,
          matchedField,
          serialize(details),
          capturedAt,
        );
        if (Number(insertResult?.changes || 0) <= 0) continue;

        created.push({
          subscriptionId: sub.id,
          captureId: String(captureId || '').trim(),
          keyword: sub.keyword,
          type: normalizedType,
          contentId: String(item?.id || '').trim(),
          title,
          matchedField,
          details,
          capturedAt,
        });
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return created;
}

function captureLeaderboardSnapshot({ type, layer = 'overall', contents = [], capturedAt = new Date().toISOString() }) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const list = buildLayerContents(contents, normalizedLayer, 50);
  const captureId = `${normalizedType}:${normalizedLayer}:${randomUUID()}`;
  const db = getDatabase();

  const prev = getLatestSnapshot({ type: normalizedType, layer: normalizedLayer });
  const prevByContentId = new Map(prev.list.map(item => [item.contentId, item]));

  const insertSnapshotStmt = db.prepare(`
    INSERT INTO leaderboard_snapshots (
      capture_id, type, layer, rank, content_id, title, hot_score, heat_metric,
      status, tags_json, source_url, evidence_json, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEventStmt = db.prepare(`
    INSERT INTO leaderboard_events (
      type, layer, event_type, content_id, title, prev_rank, new_rank, rank_delta,
      prev_hot_score, new_hot_score, message, details_json, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const events = [];

  db.exec('BEGIN');
  try {
    list.forEach((item, index) => {
      const rank = index + 1;
      const contentId = String(item?.id || '').trim();
      const title = String(item?.title || '').trim() || contentId;
      const hotScore = Number(item?.hotScore) || 0;
      const heatMetric = item?.heatMetric || (normalizedType === 'novel' ? 'reading' : 'playback');
      const status = String(item?.status || 'completed').trim() || 'completed';
      const tags = Array.isArray(item?.tags) ? item.tags : [];
      const sourceUrl = String(item?.source?.url || '').trim();
      const evidence = item?.evidence || buildDefaultEvidence(item);

      insertSnapshotStmt.run(
        captureId,
        normalizedType,
        normalizedLayer,
        rank,
        contentId,
        title,
        hotScore,
        heatMetric,
        status,
        JSON.stringify(tags),
        sourceUrl,
        serialize(evidence),
        capturedAt,
      );

      const prevEntry = prevByContentId.get(contentId) || null;
      let eventType = '';
      let prevRank = null;
      let rankDelta = null;
      let prevHotScore = null;
      let message = '';

      if (!prevEntry) {
        eventType = 'new_entry';
        message = `新上榜 #${rank}：${title}`;
      } else {
        prevRank = Number(prevEntry.rank) || null;
        prevHotScore = Number(prevEntry.hotScore) || 0;
        if (prevRank !== null) rankDelta = prevRank - rank;

        const hotDiff = hotScore - prevHotScore;
        if (rankDelta !== null && rankDelta >= 5) {
          eventType = 'rank_up';
          message = `飙升 ${rankDelta} 名：${title}`;
        } else if (rankDelta !== null && rankDelta <= -5) {
          eventType = 'rank_down';
          message = `下滑 ${Math.abs(rankDelta)} 名：${title}`;
        } else if (hotDiff >= 50_000) {
          eventType = 'hot_spike';
          message = `热度暴涨：${title}`;
        }
      }

      if (eventType) {
        const details = {
          rank,
          prevRank,
          rankDelta,
          hotScore,
          prevHotScore,
          heatMetric,
          sourceUrl,
        };

        insertEventStmt.run(
          normalizedType,
          normalizedLayer,
          eventType,
          contentId,
          title,
          prevRank,
          rank,
          rankDelta,
          prevHotScore,
          hotScore,
          message,
          serialize(details),
          capturedAt,
        );

        events.push({
          type: normalizedType,
          layer: normalizedLayer,
          eventType,
          contentId,
          title,
          prevRank,
          newRank: rank,
          rankDelta,
          prevHotScore,
          newHotScore: hotScore,
          message,
          details,
          capturedAt,
        });
      }
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const hits = recordSubscriptionHits({ type: normalizedType, contents: list, capturedAt, captureId });

  return {
    captureId,
    type: normalizedType,
    layer: normalizedLayer,
    capturedAt,
    count: list.length,
    events,
    subscriptionHits: hits,
  };
}

function listLeaderboardEvents({ type = '', layer = '', eventType = '', limit = 100 } = {}) {
  const db = getDatabase();
  const where = [];
  const params = [];

  if (String(type || '').trim()) {
    where.push('type = ?');
    params.push(ensureType(type));
  }
  if (String(layer || '').trim()) {
    where.push('layer = ?');
    params.push(ensureLayer(layer));
  }
  if (String(eventType || '').trim()) {
    where.push('event_type = ?');
    params.push(String(eventType).trim());
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitNum = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = db.prepare(`
    SELECT *
    FROM leaderboard_events
    ${whereClause}
    ORDER BY captured_at DESC, id DESC
    LIMIT ?
  `).all(...params, limitNum);

  return rows.map(toEventRow);
}

function listDistinctSnapshotCaptures({ type, layer = 'overall', limit = 30 } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const db = getDatabase();
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 30));
  const rows = db.prepare(`
    SELECT capture_id, MAX(captured_at) AS captured_at
    FROM leaderboard_snapshots
    WHERE type = ? AND layer = ?
    GROUP BY capture_id
    ORDER BY captured_at DESC
    LIMIT ?
  `).all(normalizedType, normalizedLayer, limitNum);

  return rows.map(row => ({
    captureId: row.capture_id,
    capturedAt: row.captured_at,
  }));
}

function getLeaderboardTrend({ type, layer = 'overall', contentId = '', limit = 20 } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const db = getDatabase();
  const limitNum = Math.max(2, Math.min(120, Number(limit) || 20));

  if (String(contentId || '').trim()) {
    const rows = db.prepare(`
      SELECT *
      FROM leaderboard_snapshots
      WHERE type = ? AND layer = ? AND content_id = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(normalizedType, normalizedLayer, String(contentId).trim(), limitNum);

    return rows.map(toSnapshotRow).reverse();
  }

  const captures = listDistinctSnapshotCaptures({ type: normalizedType, layer: normalizedLayer, limit: limitNum });
  const timeline = [];
  for (const item of captures.reverse()) {
    const list = getSnapshotByCaptureId(item.captureId);
    const top = list[0] || null;
    timeline.push({
      captureId: item.captureId,
      capturedAt: item.capturedAt,
      top: top ? {
        contentId: top.contentId,
        title: top.title,
        hotScore: top.hotScore,
        heatMetric: top.heatMetric,
      } : null,
      listSize: list.length,
    });
  }
  return timeline;
}

function getLeaderboardDelta({ type, layer = 'overall', baseCaptureId = '', compareCaptureId = '' } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  let baseId = String(baseCaptureId || '').trim();
  let compareId = String(compareCaptureId || '').trim();

  if (!baseId || !compareId) {
    const captures = listDistinctSnapshotCaptures({ type: normalizedType, layer: normalizedLayer, limit: 2 });
    if (captures.length < 2) {
      return {
        baseCaptureId: captures[1]?.captureId || null,
        compareCaptureId: captures[0]?.captureId || null,
        added: [],
        dropped: [],
        moved: [],
      };
    }
    compareId = captures[0].captureId;
    baseId = captures[1].captureId;
  }

  const base = getSnapshotByCaptureId(baseId);
  const compare = getSnapshotByCaptureId(compareId);

  const baseMap = new Map(base.map(item => [item.contentId, item]));
  const compareMap = new Map(compare.map(item => [item.contentId, item]));

  const added = [];
  const dropped = [];
  const moved = [];

  for (const item of compare) {
    const prev = baseMap.get(item.contentId);
    if (!prev) {
      added.push({
        contentId: item.contentId,
        title: item.title,
        rank: item.rank,
        hotScore: item.hotScore,
      });
      continue;
    }

    const delta = prev.rank - item.rank;
    const hotDiff = item.hotScore - prev.hotScore;
    if (delta !== 0 || hotDiff !== 0) {
      moved.push({
        contentId: item.contentId,
        title: item.title,
        prevRank: prev.rank,
        newRank: item.rank,
        rankDelta: delta,
        prevHotScore: prev.hotScore,
        newHotScore: item.hotScore,
        hotScoreDelta: hotDiff,
      });
    }
  }

  for (const item of base) {
    if (!compareMap.has(item.contentId)) {
      dropped.push({
        contentId: item.contentId,
        title: item.title,
        rank: item.rank,
        hotScore: item.hotScore,
      });
    }
  }

  return {
    baseCaptureId: baseId,
    compareCaptureId: compareId,
    added,
    dropped,
    moved: moved.sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta)),
  };
}

function exportLeaderboardAsCsv({ type, layer = 'overall', captureId = '' } = {}) {
  const normalizedType = ensureType(type);
  const normalizedLayer = ensureLayer(layer);
  const resolvedCaptureId = String(captureId || '').trim() || getLatestCaptureId({ type: normalizedType, layer: normalizedLayer });
  const rows = getSnapshotByCaptureId(resolvedCaptureId);

  const header = ['rank', 'content_id', 'title', 'hot_score', 'heat_metric', 'status', 'tags', 'source_url', 'captured_at'];
  const escape = (value) => {
    const str = String(value ?? '');
    const escaped = str.replace(/"/g, '""');
    if (/^[=+@\-]/.test(escaped)) return `"\t${escaped}"`;
    return `"${escaped}"`;
  };
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      row.rank,
      row.contentId,
      row.title,
      row.hotScore,
      row.heatMetric,
      row.status,
      (row.tags || []).join('|'),
      row.sourceUrl || '',
      row.capturedAt,
    ].map(escape).join(','));
  }

  return {
    type: normalizedType,
    layer: normalizedLayer,
    captureId: resolvedCaptureId,
    csv: `${lines.join('\n')}\n`,
  };
}

function getLeaderboardLayerConfig() {
  return {
    layers: LAYERS.map(layer => ({
      id: layer,
      name: layer === 'overall'
        ? '总榜'
        : layer === 'new'
          ? '新作榜'
          : layer === 'rising'
            ? '飙升榜'
            : '完结榜',
    })),
    types: CONTENT_TYPES,
  };
}

export {
  CONTENT_TYPES,
  LAYERS,
  buildLayerContents,
  captureLeaderboardSnapshot,
  createKeywordSubscription,
  deleteKeywordSubscription,
  exportLeaderboardAsCsv,
  getKeywordSubscriptionById,
  getLatestSnapshot,
  listSnapshotsByContentId,
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
  recordSubscriptionHits,
  toEventRow,
  toSnapshotRow,
  updateKeywordSubscription,
};
