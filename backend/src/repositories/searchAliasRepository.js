import { getDatabase } from '../db/database.js';

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toAliasGroup(row) {
  if (!row) return null;
  return {
    id: Number(row.id) || 0,
    canonicalKeyword: row.canonical_keyword || '',
    aliases: parseJson(row.aliases_json, []),
    type: row.type || '',
    enabled: Number(row.enabled) === 1,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listSearchAliasGroups({ type = '', enabled } = {}) {
  const db = getDatabase();
  const where = [];
  const params = [];
  const normalizedType = String(type || '').trim().toLowerCase();

  if (normalizedType) {
    where.push("COALESCE(type, '') = ?");
    params.push(normalizedType);
  }
  if (enabled !== undefined) {
    where.push('enabled = ?');
    params.push(Boolean(enabled) ? 1 : 0);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT *
    FROM search_alias_groups
    ${whereClause}
    ORDER BY enabled DESC, updated_at DESC, id DESC
  `).all(...params);

  return rows.map(toAliasGroup);
}

function getSearchAliasGroupById(id) {
  const groupId = Number(id) || 0;
  if (!groupId) return null;
  const row = getDatabase().prepare('SELECT * FROM search_alias_groups WHERE id = ?').get(groupId);
  return toAliasGroup(row);
}

function createSearchAliasGroup({ canonicalKeyword, aliases = [], type = '', enabled = true, notes = '' }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO search_alias_groups (
      canonical_keyword,
      aliases_json,
      type,
      enabled,
      notes,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    canonicalKeyword,
    JSON.stringify(aliases),
    type || null,
    enabled ? 1 : 0,
    notes || null,
    now,
    now,
  );

  return getSearchAliasGroupById(Number(result?.lastInsertRowid) || 0);
}

function updateSearchAliasGroup(id, patch = {}) {
  const groupId = Number(id) || 0;
  if (!groupId) return null;

  const current = getSearchAliasGroupById(groupId);
  if (!current) return null;

  const next = {
    canonicalKeyword: patch.canonicalKeyword ?? current.canonicalKeyword,
    aliases: patch.aliases ?? current.aliases,
    type: patch.type ?? current.type,
    enabled: patch.enabled ?? current.enabled,
    notes: patch.notes ?? current.notes,
  };

  getDatabase().prepare(`
    UPDATE search_alias_groups
    SET canonical_keyword = ?, aliases_json = ?, type = ?, enabled = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.canonicalKeyword,
    JSON.stringify(next.aliases),
    next.type || null,
    next.enabled ? 1 : 0,
    next.notes || null,
    new Date().toISOString(),
    groupId,
  );

  return getSearchAliasGroupById(groupId);
}

function deleteSearchAliasGroup(id) {
  const groupId = Number(id) || 0;
  if (!groupId) return false;
  const result = getDatabase().prepare('DELETE FROM search_alias_groups WHERE id = ?').run(groupId);
  return Number(result?.changes || 0) > 0;
}

export {
  listSearchAliasGroups,
  getSearchAliasGroupById,
  createSearchAliasGroup,
  updateSearchAliasGroup,
  deleteSearchAliasGroup,
};
