import { getDatabase } from '../db/database.js';

function rowToCursor(row) {
  if (!row) return null;
  return {
    type: row.type,
    source: row.source,
    cursor: row.cursor || '',
    updatedAt: row.updated_at || '',
    lastStatus: row.last_status || '',
    lastCount: Number(row.last_count || 0),
    lastError: row.last_error || null,
    refreshedAt: row.refreshed_at,
  };
}

function getIngestionCursor({ type, source }) {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM ingestion_cursors WHERE type = ? AND source = ?')
    .get(type, source);
  return rowToCursor(row);
}

function saveIngestionCursor({
  type,
  source,
  cursor = '',
  updatedAt = '',
  lastStatus = 'success',
  lastCount = 0,
  lastError = null,
  refreshedAt,
}) {
  const now = refreshedAt || new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO ingestion_cursors (type, source, cursor, updated_at, last_status, last_count, last_error, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(type, source) DO UPDATE SET
      cursor = excluded.cursor,
      updated_at = excluded.updated_at,
      last_status = excluded.last_status,
      last_count = excluded.last_count,
      last_error = excluded.last_error,
      refreshed_at = excluded.refreshed_at
  `).run(
    type,
    source,
    String(cursor || ''),
    String(updatedAt || ''),
    String(lastStatus || 'success'),
    Number(lastCount) || 0,
    lastError ? String(lastError) : null,
    now,
  );

  return getIngestionCursor({ type, source });
}

function listIngestionCursors() {
  const rows = getDatabase()
    .prepare('SELECT * FROM ingestion_cursors ORDER BY type ASC, source ASC')
    .all();
  return rows.map(rowToCursor);
}

export { getIngestionCursor, saveIngestionCursor, listIngestionCursors };
