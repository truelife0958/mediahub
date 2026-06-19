import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { rowToContent } from './contentRepository.js';
import { MAX_FAVORITES, MAX_FOLLOWS, MAX_WATCH_HISTORY } from '../utils/store.js';

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

  try {
    getDatabase().prepare(`
      INSERT INTO users (id, username, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, user.username, user.createdAt, user.updatedAt);
  } catch (error) {
    // Handle concurrent registration with the same username
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
      const existing = findUserByUsername(username);
      if (existing) return existing;
    }
    throw error;
  }

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
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND content_id = ?').get(userId, contentId);

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

  try {
    db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, content_id, created_at)
      VALUES (?, ?, ?)
    `).run(userId, contentId, now);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { isFavorite: true };
    }
    throw error;
  }

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

function toggleFollow(userId, contentId) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT 1 FROM user_follows WHERE user_id = ? AND content_id = ?').get(userId, contentId);

  if (existing) {
    db.prepare('DELETE FROM user_follows WHERE user_id = ? AND content_id = ?').run(userId, contentId);
    touchUser(userId, now);
    return { isFollowing: false };
  }

  const followCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE user_id = ?').get(userId).count;
  if (Number(followCount) >= MAX_FOLLOWS) {
    const error = new Error('Follows limit reached');
    error.statusCode = 400;
    error.code = 1001;
    throw error;
  }

  try {
    db.prepare(`
      INSERT OR IGNORE INTO user_follows (user_id, content_id, created_at)
      VALUES (?, ?, ?)
    `).run(userId, contentId, now);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { isFollowing: true };
    }
    throw error;
  }

  touchUser(userId, now);
  return { isFollowing: true };
}

function listFollows(userId) {
  const rows = getDatabase().prepare(`
    SELECT c.*
    FROM user_follows f
    INNER JOIN contents c ON c.id = f.content_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(userId);

  return rows.map(row => rowToContent(row, true));
}

function createUserKeywordSubscription({ userId, keyword, type = '' }) {
  const now = new Date().toISOString();
  const normalizedKeyword = String(keyword || '').trim().slice(0, 80);
  const normalizedType = String(type || '').trim().toLowerCase();
  const result = getDatabase().prepare(`
    INSERT INTO user_keyword_subscriptions (user_id, keyword, type, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, normalizedKeyword, normalizedType, now);
  touchUser(userId, now);
  return Number(result.lastInsertRowid);
}

function findUserKeywordSubscription(userId, keyword, type = '') {
  const normalizedKeyword = String(keyword || '').trim().slice(0, 80);
  const normalizedType = String(type || '').trim().toLowerCase();
  if (!normalizedKeyword) return null;

  const row = getDatabase().prepare(`
    SELECT id, keyword, type, created_at
    FROM user_keyword_subscriptions
    WHERE user_id = ?
      AND lower(keyword) = lower(?)
      AND COALESCE(type, '') = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, normalizedKeyword, normalizedType);

  if (!row) return null;
  return {
    id: Number(row.id),
    keyword: row.keyword,
    type: row.type || '',
    createdAt: row.created_at,
  };
}

function deleteUserKeywordSubscription(userId, id) {
  const result = getDatabase().prepare('DELETE FROM user_keyword_subscriptions WHERE user_id = ? AND id = ?').run(userId, Number(id) || 0);
  touchUser(userId);
  return Number(result.changes || 0) > 0;
}

function listUserKeywordSubscriptions(userId) {
  return getDatabase().prepare(`
    SELECT id, keyword, type, created_at
    FROM user_keyword_subscriptions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(row => ({
    id: Number(row.id),
    keyword: row.keyword,
    type: row.type || '',
    createdAt: row.created_at,
  }));
}

export {
  createUser,
  findUserByUsername,
  getUserById,
  upsertWatchHistory,
  listWatchHistory,
  toggleFavorite,
  listFavorites,
  toggleFollow,
  listFollows,
  createUserKeywordSubscription,
  findUserKeywordSubscription,
  deleteUserKeywordSubscription,
  listUserKeywordSubscriptions,
};
