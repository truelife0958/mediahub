import { getDatabase } from '../db/database.js';

const VISIBLE_RUN_SOURCES = [
  'platform_hot',
  'json_hot_dataset',
  'hongguo',
  'fanqie',
  'qidian',
  'baidu-hot',
  'weibo-hot',
  'wechat-hot',
  'douyin-hot',
];

const VISIBLE_SOURCE_PLACEHOLDERS = VISIBLE_RUN_SOURCES.map(() => '?').join(', ');

function recordSourceRun({ type, source, status, count = 0, error = null, startedAt, finishedAt }) {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO source_runs (type, source, status, count, error, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(type, source, status, Number(count) || 0, error, startedAt || now, finishedAt || now);
}

function getSourceStatuses() {
  const rows = getDatabase().prepare(`
    SELECT sr.*
    FROM source_runs sr
    INNER JOIN (
      SELECT type, MAX(id) as id
      FROM source_runs
      WHERE source IN (${VISIBLE_SOURCE_PLACEHOLDERS})
      GROUP BY type
    ) latest ON latest.id = sr.id
    WHERE sr.source IN (${VISIBLE_SOURCE_PLACEHOLDERS})
    ORDER BY sr.type ASC
  `).all(...VISIBLE_RUN_SOURCES, ...VISIBLE_RUN_SOURCES);

  return rows.map(row => ({
    type: row.type,
    source: row.source,
    status: row.status,
    count: Number(row.count) || 0,
    error: row.error || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

function listSourceRuns({ limit = 50 } = {}) {
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const rows = getDatabase().prepare(`
    SELECT *
    FROM source_runs
    WHERE source IN (${VISIBLE_SOURCE_PLACEHOLDERS})
    ORDER BY finished_at DESC, id DESC
    LIMIT ?
  `).all(...VISIBLE_RUN_SOURCES, limitNum);

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    source: row.source,
    status: row.status,
    count: Number(row.count) || 0,
    error: row.error || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export { recordSourceRun, getSourceStatuses, listSourceRuns };
