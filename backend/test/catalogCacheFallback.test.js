import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { listContents } from '../src/services/catalogService.js';

const cached = {
  id: 'anime:jikan:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cover.jpg',
  summary: 'Cached real content.',
  type: 'anime',
  tags: ['Action'],
  actors: [],
  author: 'Jikan',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

test('listContents returns stale cached content when upstream fails', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({ type: 'anime', page: 1, limit: 10, __skipLiveFetchForTest: true });

  assert.equal(result.stale, true);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, 'Cached Anime');
});
