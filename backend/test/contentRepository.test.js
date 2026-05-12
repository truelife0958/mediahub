import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents, listCachedContents, getCachedContentById } from '../src/repositories/contentRepository.js';

const sample = {
  id: 'anime:jikan:1',
  title: 'Cowboy Bebop',
  cover: 'https://example.com/cover.jpg',
  summary: 'Space bounty hunters.',
  type: 'anime',
  tags: ['Action', 'Sci-Fi'],
  actors: ['Sunrise'],
  author: 'Original',
  ipName: 'Cowboy Bebop',
  status: 'completed',
  hotScore: 9000,
  createdAt: '1998-04-03T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

test('upsertContents stores and lists stale-capable cached content', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const result = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });
  const detail = getCachedContentById('anime:jikan:1');

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, sample.id);
  assert.equal(result.list[0].stale, true);
  assert.equal(result.list[0].source.provider, 'jikan');
  assert.equal(detail.title, sample.title);
  assert.deepEqual(detail.tags, sample.tags);
});
