import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import {
  createUser,
  findUserByUsername,
  getUserById,
  upsertWatchHistory,
  listWatchHistory,
  toggleFavorite,
  listFavorites,
} from '../src/repositories/userRepository.js';
import { upsertContents } from '../src/repositories/contentRepository.js';

const content = {
  id: 'anime:ai-search:1',
  title: 'Persisted Anime',
  cover: 'https://example.com/c.jpg',
  summary: 'Summary',
  type: 'anime',
  tags: ['Action'],
  actors: ['Studio'],
  author: 'AI Discovery',
  ipName: 'Persisted Anime',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/1' },
};

test('userRepository persists users, history, and favorites', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([content]);
  const user = createUser('alice');

  assert.equal(findUserByUsername('alice').id, user.id);
  assert.equal(getUserById(user.id).username, 'alice');

  upsertWatchHistory(user.id, content.id);
  assert.equal(listWatchHistory(user.id)[0].content.title, 'Persisted Anime');

  assert.equal(toggleFavorite(user.id, content.id).isFavorite, true);
  assert.equal(listFavorites(user.id)[0].title, 'Persisted Anime');
  assert.equal(toggleFavorite(user.id, content.id).isFavorite, false);
  assert.equal(listFavorites(user.id).length, 0);
});
