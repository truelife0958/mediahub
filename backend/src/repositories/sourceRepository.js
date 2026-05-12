import { getDatabase } from '../db/database.js';

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
      GROUP BY type
    ) latest ON latest.id = sr.id
    ORDER BY sr.type ASC
  `).all();

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

export { recordSourceRun, getSourceStatuses };
