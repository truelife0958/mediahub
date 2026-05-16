import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { listContents } from '../src/services/catalogService.js';

const cached = {
  id: 'anime:ai-search:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cover.jpg',
  summary: 'Cached real content.',
  type: 'anime',
  tags: ['Action'],
  actors: [],
  author: 'AI Discovery',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/1' },
};

test('listContents returns database content directly when cache exists', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({ type: 'anime', page: 1, limit: 10, __skipLiveFetchForTest: true });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, 'Cached Anime');
});

test('listContents returns empty list for keyword miss when cache already has this type', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({
    type: 'anime',
    keyword: 'naruto',
    page: 1,
    limit: 10,
    __skipLiveFetchForTest: true,
  });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 0);
  assert.equal(result.pagination.total, 0);
});

test('listContents returns empty list instead of upstream error when no cache exists', async () => {
  resetDatabaseForTest(':memory:');

  const result = await listContents({
    type: 'anime',
    page: 1,
    limit: 10,
    __skipLiveFetchForTest: true,
  });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 0);
  assert.equal(result.pagination.total, 0);
});
