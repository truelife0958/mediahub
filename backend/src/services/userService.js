import {
  createUser,
  findUserByUsername,
  getUserById,
  upsertWatchHistory,
  listWatchHistory,
  toggleFavorite as toggleFavoriteRecord,
  listFavorites,
  toggleFollow as toggleFollowRecord,
  listFollows,
  createUserKeywordSubscription,
  findUserKeywordSubscription,
  deleteUserKeywordSubscription,
  listUserKeywordSubscriptions,
} from '../repositories/userRepository.js';
import { getCachedContentById, upsertContents } from '../repositories/contentRepository.js';
import { createApiError } from '../utils/apiErrors.js';
import { parseContentId, getContentById as fetchContentById } from './catalogService.js';

const CONTENT_TYPES = ['drama', 'novel', 'comic', 'anime'];

function findUser(userId) {
  const user = getUserById(userId);
  if (!user) throw createApiError('not_found', 'User not found');
  return user;
}

async function ensureContentExists(contentId) {
  parseContentId(contentId);

  const cached = getCachedContentById(contentId);
  if (cached) return cached;

  const remote = await fetchContentById(contentId);
  upsertContents([remote]);
  return getCachedContentById(contentId);
}

export function getUserProfile(userId) {
  const user = findUser(userId);
  const history = listWatchHistory(user.id);
  const follows = listFollows(user.id);
  const subscriptions = listUserKeywordSubscriptions(user.id);
  return {
    id: user.id,
    username: user.username,
    recentlyWatchedIds: history.map(entry => entry.content?.id).filter(Boolean),
    followingIds: follows.map(item => item.id).filter(Boolean),
    subscriptions,
  };
}

export async function markWatched(userId, contentId) {
  if (!userId || !contentId) throw createApiError('invalid_request', 'Missing userId or contentId');

  await ensureContentExists(contentId);
  findUser(userId);
  return upsertWatchHistory(userId, contentId);
}

export function getWatchHistory(userId) {
  findUser(userId);
  return listWatchHistory(userId);
}

export function registerUser(username) {
  const trimmed = (username || '').trim().slice(0, 50);
  if (!trimmed) throw createApiError('invalid_request', 'Invalid username');

  const existing = findUserByUsername(trimmed);
  if (existing) return { id: existing.id, username: existing.username };

  const user = createUser(trimmed);
  return { id: user.id, username: user.username };
}

export async function toggleFavorite(userId, contentId) {
  if (!userId || !contentId) throw createApiError('invalid_request', 'Missing userId or contentId');

  await ensureContentExists(contentId);
  findUser(userId);
  return toggleFavoriteRecord(userId, contentId);
}

export function getFavorites(userId) {
  findUser(userId);
  return listFavorites(userId);
}

export async function toggleFollow(userId, contentId) {
  if (!userId || !contentId) throw createApiError('invalid_request', 'Missing userId or contentId');

  await ensureContentExists(contentId);
  findUser(userId);
  return toggleFollowRecord(userId, contentId);
}

export function getFollows(userId) {
  findUser(userId);
  return listFollows(userId);
}

export function createKeywordSubscription(userId, payload = {}) {
  findUser(userId);
  const keyword = String(payload.keyword || '').trim().slice(0, 80);
  const type = String(payload.type || '').trim().toLowerCase();
  if (!keyword) throw createApiError('invalid_request', 'keyword is required');
  if (type && !CONTENT_TYPES.includes(type)) throw createApiError('invalid_request', 'Invalid content type');

  const existing = findUserKeywordSubscription(userId, keyword, type);
  if (existing) return { ...existing, alreadyExists: true };

  const id = createUserKeywordSubscription({ userId, keyword, type });
  return { ...listUserKeywordSubscriptions(userId).find(item => item.id === id), alreadyExists: false };
}

export function removeKeywordSubscription(userId, id) {
  findUser(userId);
  const deleted = deleteUserKeywordSubscription(userId, id);
  if (!deleted) throw createApiError('not_found', 'subscription not found');
  return { deleted: true, id: Number(id) || 0 };
}

export function getKeywordSubscriptions(userId) {
  findUser(userId);
  return listUserKeywordSubscriptions(userId);
}

function countValues(values = []) {
  const map = new Map();
  for (const value of values) {
    const key = String(value || '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 12);
}

export function getPreferenceProfile(userId) {
  findUser(userId);
  const history = listWatchHistory(userId);
  const contents = history.map(item => item.content).filter(Boolean);
  const byType = CONTENT_TYPES.map(type => ({
    type,
    count: contents.filter(item => item.type === type).length,
  }));
  const favoriteTags = countValues(contents.flatMap(item => item.tags || []));
  const favoriteActors = countValues(contents.flatMap(item => item.actors || []));
  const favoriteCharacters = countValues(contents.flatMap(item => item.characters || []));
  const favoriteIps = countValues(contents.map(item => item.ipName));
  const total = contents.length;
  const topType = [...byType].sort((a, b) => b.count - a.count)[0]?.type || 'drama';
  const summary = total === 0
    ? '还没有已看记录，先在详情页标注已看来生成偏好画像。'
    : `已基于 ${total} 条已看记录生成画像，当前偏好更接近${topType === 'drama' ? '短剧' : topType === 'novel' ? '小说' : topType === 'comic' ? '漫画' : '动漫'}。`;

  return {
    totalWatched: total,
    byType,
    favoriteTags,
    favoriteActors,
    favoriteCharacters,
    favoriteIps,
    summary,
  };
}
