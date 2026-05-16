import {
  createUser,
  findUserByUsername,
  getUserById,
  upsertWatchHistory,
  listWatchHistory,
  toggleFavorite as toggleFavoriteRecord,
  listFavorites,
} from '../repositories/userRepository.js';
import { getCachedContentById, upsertContents } from '../repositories/contentRepository.js';
import { createApiError } from '../utils/apiErrors.js';
import { parseContentId, getContentById as fetchContentById } from './catalogService.js';

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
  return { id: user.id, username: user.username };
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
