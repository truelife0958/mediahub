import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { rowToContent } from './contentRepository.js';
import { MAX_FAVORITES, MAX_WATCH_HISTORY } from '../utils/store.js';

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createUser(username) {
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    username,
    createdAt: now,
    updatedAt: now,
  };

  getDatabase().prepare(`
    INSERT INTO users (id, username, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, user.username, user.createdAt, user.updatedAt);

  return user;
}

function findUserByUsername(username) {
  const row = getDatabase().prepare('SELECT * FROM users WHERE username = ?').get(username);
  return rowToUser(row);
}

function getUserById(userId) {
  const row = getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return rowToUser(row);
}

function touchUser(userId, now = new Date().toISOString()) {
  getDatabase().prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now, userId);
}

function upsertWatchHistory(userId, contentId) {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO watch_history (user_id, content_id, watched_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, content_id) DO UPDATE SET watched_at = excluded.watched_at
  `).run(userId, contentId, now);

  const extraRows = db.prepare(`
    SELECT content_id
    FROM watch_history
    WHERE user_id = ?
    ORDER BY watched_at DESC
    LIMIT -1 OFFSET ?
  `).all(userId, MAX_WATCH_HISTORY);

  if (extraRows.length > 0) {
    const deleteStmt = db.prepare('DELETE FROM watch_history WHERE user_id = ? AND content_id = ?');
    for (const row of extraRows) {
      deleteStmt.run(userId, row.content_id);
    }
  }

  touchUser(userId, now);
  return { watched: true };
}

function listWatchHistory(userId) {
  const rows = getDatabase().prepare(`
    SELECT
      wh.watched_at,
      c.*
    FROM watch_history wh
    INNER JOIN contents c ON c.id = wh.content_id
    WHERE wh.user_id = ?
    ORDER BY wh.watched_at DESC
  `).all(userId);

  return rows.map(row => ({
    content: rowToContent(row, true),
    watchedAt: row.watched_at,
  }));
}

function toggleFavorite(userId, contentId) {
  const db = getDatabase();
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND content_id = ?').get(userId, contentId);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND content_id = ?').run(userId, contentId);
    touchUser(userId, now);
    return { isFavorite: false };
  }

  const favoriteCount = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(userId).count;
  if (Number(favoriteCount) >= MAX_FAVORITES) {
    const error = new Error('Favorites limit reached');
    error.statusCode = 400;
    error.code = 1001;
    throw error;
  }

  db.prepare(`
    INSERT INTO favorites (user_id, content_id, created_at)
    VALUES (?, ?, ?)
  `).run(userId, contentId, now);

  touchUser(userId, now);
  return { isFavorite: true };
}

function listFavorites(userId) {
  const rows = getDatabase().prepare(`
    SELECT c.*
    FROM favorites f
    INNER JOIN contents c ON c.id = f.content_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(userId);

  return rows.map(row => rowToContent(row, true));
}

export {
  createUser,
  findUserByUsername,
  getUserById,
  upsertWatchHistory,
  listWatchHistory,
  toggleFavorite,
  listFavorites,
};
