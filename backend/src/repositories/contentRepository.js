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
  const stmt = db.prepare(`
    INSERT INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      cached_at = excluded.cached_at
  `);

  db.exec('BEGIN');
  try {
    for (const item of contents) {
      stmt.run(
        item.id,
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
        now
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return contents.length;
}

function listCachedContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '' }) {
  const db = getDatabase();
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const orderBy = sort === 'latest' ? 'updated_at DESC' : 'hot_score DESC';
  const normalizedKeyword = String(keyword || '').trim();
  const where = normalizedKeyword
    ? 'WHERE type = ? AND (title LIKE ? OR summary LIKE ? OR author LIKE ? OR ip_name LIKE ?)'
    : 'WHERE type = ?';
  const args = normalizedKeyword
    ? [type, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`]
    : [type];

  const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${where}`).get(...args).total;
  const rows = db.prepare(`SELECT * FROM contents ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args, limitNum, offset);

  return {
    list: rows.map(row => rowToContent(row, true)),
    pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
    stale: true,
  };
}

function getCachedContentById(contentId) {
  const row = getDatabase().prepare('SELECT * FROM contents WHERE id = ?').get(contentId);
  return rowToContent(row, true);
}

export { upsertContents, listCachedContents, getCachedContentById, rowToContent };
