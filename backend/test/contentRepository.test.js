import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import {
  upsertContents,
  listCachedContents,
  getCachedContentById,
  tokenizeKeywordForFts,
  buildDedupeHash,
} from '../src/repositories/contentRepository.js';

const sample = {
  id: 'anime:ai-search:1',
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
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/1' },
};

test('upsertContents stores and lists stale-capable cached content', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const result = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });
  const detail = getCachedContentById('anime:ai-search:1');

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, sample.id);
  assert.equal(result.list[0].stale, true);
  assert.equal(result.list[0].source.provider, 'ai-search');
  assert.equal(detail.title, sample.title);
  assert.deepEqual(detail.tags, sample.tags);
});

test('FTS search matches multi-token keyword and keeps deterministic pagination', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    {
      ...sample,
      id: 'anime:ai-search:100',
      title: 'dragon king returns',
      summary: 'A return of the king',
      ipName: 'dragon-king',
      hotScore: 200,
    },
    {
      ...sample,
      id: 'anime:ai-search:101',
      title: 'dragon legend',
      summary: 'A king tale',
      ipName: 'dragon-legend',
      hotScore: 150,
    },
    {
      ...sample,
      id: 'anime:ai-search:102',
      title: 'other story',
      summary: 'not relevant',
      ipName: 'other',
      hotScore: 99,
    },
  ]);

  const page1 = listCachedContents({ type: 'anime', page: 1, limit: 1, sort: 'hot', keyword: 'dragon king' });
  const page2 = listCachedContents({ type: 'anime', page: 2, limit: 1, sort: 'hot', keyword: 'dragon king' });

  assert.equal(page1.pagination.total, 2);
  assert.equal(page1.list.length, 1);
  assert.equal(page1.list[0].id, 'anime:ai-search:100');
  assert.equal(page2.list.length, 1);
  assert.equal(page2.list[0].id, 'anime:ai-search:101');
});

test('upsertContents dedupes by normalized title + source + ipName', () => {
  resetDatabaseForTest(':memory:');

  const first = {
    ...sample,
    id: 'anime:ai-search:dup-1',
    title: 'Dragon King Returns',
    ipName: 'dragon-king-returns',
    source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/dup-1' },
  };
  const duplicate = {
    ...sample,
    id: 'anime:ai-search:dup-2',
    title: ' Dragon-King Returns ',
    ipName: 'dragon-king-returns',
    source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/dup-2' },
    summary: 'updated summary',
  };

  upsertContents([first]);
  upsertContents([duplicate]);

  const result = listCachedContents({ type: 'anime', page: 1, limit: 20, sort: 'hot' });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, 'anime:ai-search:dup-1');
  assert.equal(result.list[0].summary, 'updated summary');
});

test('tokenizeKeywordForFts builds safe prefix query for FTS5', () => {
  const query = tokenizeKeywordForFts('dragon "king"');
  assert.equal(query, '"dragon"* OR """king"""*');
});

test('buildDedupeHash is stable for whitespace and punctuation variants', () => {
  const a = buildDedupeHash({
    type: 'anime',
    title: 'Dragon King Returns',
    ipName: 'same-ip',
    source: { provider: 'ai-search' },
  });
  const b = buildDedupeHash({
    type: 'anime',
    title: ' Dragon-King Returns ',
    ipName: 'same-ip',
    source: { provider: 'ai-search' },
  });

  assert.equal(a, b);
});
