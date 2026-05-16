import { getDatabase } from '../db/database.js';

function serialize(value) {
  return JSON.stringify(value ?? []);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .trim();
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildDedupeHash(item) {
  const normalized = normalizeTitle(item.title);
  const sourceProvider = normalizeText(item.source?.provider || item.source?.label || 'unknown');
  const ipName = normalizeText(item.ipName || item.title);
  return `${item.type}|${normalized}|${sourceProvider}|${ipName}`;
}

function tokenizeKeywordForFts(keyword) {
  return String(keyword || '')
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => `"${token.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

function rowToContent(row, stale = true) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    type: row.type,
    tags: parseJson(row.tags_json, []),
    actors: parseJson(row.actors_json, []),
    author: row.author || '',
    ipName: row.ip_name || row.title,
    status: row.status || 'completed',
    hotScore: Number(row.hot_score) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cachedAt: row.cached_at,
    stale,
    source: parseJson(row.source_json, { provider: 'unknown', label: 'Unknown', url: '' }),
  };
}

function upsertContents(contents = []) {
  if (contents.length === 0) return 0;
  const db = getDatabase();
  const now = new Date().toISOString();

  const findExistingStmt = db.prepare('SELECT id FROM contents WHERE id = ? OR dedupe_hash = ? LIMIT 1');
  const upsertStmt = db.prepare(`
    INSERT INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at,
      normalized_title, dedupe_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      cover = excluded.cover,
      summary = excluded.summary,
      author = excluded.author,
      ip_name = excluded.ip_name,
      status = excluded.status,
      hot_score = excluded.hot_score,
      tags_json = excluded.tags_json,
      actors_json = excluded.actors_json,
      source_json = excluded.source_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      cached_at = excluded.cached_at,
      normalized_title = excluded.normalized_title,
      dedupe_hash = excluded.dedupe_hash
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const item of contents) {
      const normalizedTitle = normalizeTitle(item.title);
      const dedupeHash = buildDedupeHash(item);
      const existing = findExistingStmt.get(item.id, dedupeHash);
      const persistentId = existing?.id || item.id;

      const result = upsertStmt.run(
        persistentId,
        item.type,
        item.title,
        item.cover,
        item.summary,
        item.author || '',
        item.ipName || item.title,
        item.status || 'completed',
        Number(item.hotScore) || 0,
        serialize(item.tags || []),
        serialize(item.actors || []),
        JSON.stringify(item.source || {}),
        item.createdAt || now,
        item.updatedAt || now,
        now,
        normalizedTitle,
        dedupeHash,
      );
      count += Number(result?.changes || 0);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return count;
}

function listCachedContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '', stale = true }) {
  const db = getDatabase();
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const orderBy = sort === 'latest' ? 'updated_at DESC' : 'hot_score DESC';
  const normalizedKeyword = String(keyword || '').trim();

  if (normalizedKeyword) {
    const ftsQuery = tokenizeKeywordForFts(normalizedKeyword);
    if (ftsQuery) {
      const countRow = db.prepare(`
        SELECT COUNT(*) AS total
        FROM contents_fts
        JOIN contents c ON c.rowid = contents_fts.rowid
        WHERE contents_fts MATCH ? AND c.type = ?
      `).get(ftsQuery, type);

      const rows = db.prepare(`
        SELECT c.*
        FROM contents_fts
        JOIN contents c ON c.rowid = contents_fts.rowid
        WHERE contents_fts MATCH ? AND c.type = ?
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(ftsQuery, type, limitNum, offset);

      return {
        list: rows.map(row => rowToContent(row, stale)),
        pagination: { page: pageNum, limit: limitNum, total: Number(countRow?.total) || 0 },
        stale,
      };
    }
  }

  const where = 'WHERE type = ?';
  const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${where}`).get(type).total;
  const rows = db.prepare(`SELECT * FROM contents ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(type, limitNum, offset);

  return {
    list: rows.map(row => rowToContent(row, stale)),
    pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
    stale,
  };
}

function getCachedContentById(contentId, { stale = true } = {}) {
  const row = getDatabase().prepare('SELECT * FROM contents WHERE id = ?').get(contentId);
  return rowToContent(row, stale);
}

function countCachedContentsByType(type) {
  const row = getDatabase().prepare('SELECT COUNT(*) as total FROM contents WHERE type = ?').get(type);
  return Number(row?.total) || 0;
}

function updateCachedContent(contentId, patch = {}) {
  const current = getCachedContentById(contentId, { stale: false });
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    tags: Array.isArray(patch.tags) ? patch.tags : current.tags,
    actors: Array.isArray(patch.actors) ? patch.actors : current.actors,
    hotScore: patch.hotScore === undefined ? current.hotScore : Number(patch.hotScore) || 0,
    updatedAt: new Date().toISOString(),
  };

  upsertContents([next]);
  return getCachedContentById(contentId, { stale: false });
}

function listContentQualityStats() {
  const rows = getDatabase().prepare('SELECT * FROM contents').all();
  const byType = new Map();
  const duplicateGroups = new Map();
  const totals = {
    total: 0,
    missingCover: 0,
    missingSummary: 0,
    missingTags: 0,
    lowHotScore: 0,
  };

  for (const row of rows) {
    const item = rowToContent(row, false);
    if (!item) continue;
    totals.total += 1;
    const typeStats = byType.get(item.type) || {
      type: item.type,
      total: 0,
      missingCover: 0,
      missingSummary: 0,
      missingTags: 0,
      lowHotScore: 0,
    };
    typeStats.total += 1;

    const missingCover = !String(item.cover || '').trim();
    const missingSummary = !String(item.summary || '').trim() || item.summary.length < 8;
    const missingTags = !Array.isArray(item.tags) || item.tags.length === 0;
    const lowHotScore = Number(item.hotScore) < 100;

    if (missingCover) { totals.missingCover += 1; typeStats.missingCover += 1; }
    if (missingSummary) { totals.missingSummary += 1; typeStats.missingSummary += 1; }
    if (missingTags) { totals.missingTags += 1; typeStats.missingTags += 1; }
    if (lowHotScore) { totals.lowHotScore += 1; typeStats.lowHotScore += 1; }
    byType.set(item.type, typeStats);

    const duplicateKey = `${item.type}|${normalizeTitle(item.title)}|${normalizeText(item.ipName || '')}`;
    const duplicateList = duplicateGroups.get(duplicateKey) || [];
    duplicateList.push({ id: item.id, title: item.title, type: item.type, ipName: item.ipName, hotScore: item.hotScore });
    duplicateGroups.set(duplicateKey, duplicateList);
  }

  const issueCount = totals.missingCover + totals.missingSummary + totals.missingTags + totals.lowHotScore;
  const qualityScore = totals.total === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 - (issueCount / (totals.total * 4)) * 100)));

  return {
    ...totals,
    qualityScore,
    byType: [...byType.values()].sort((a, b) => a.type.localeCompare(b.type)),
    duplicateCandidates: [...duplicateGroups.values()]
      .filter(group => group.length > 1)
      .slice(0, 20),
  };
}

export {
  upsertContents,
  listCachedContents,
  getCachedContentById,
  countCachedContentsByType,
  updateCachedContent,
  listContentQualityStats,
  rowToContent,
  normalizeTitle,
  buildDedupeHash,
  tokenizeKeywordForFts,
};
