import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { refreshContentType } from '../src/services/ingestionService.js';
import { listCachedContents } from '../src/repositories/contentRepository.js';
import { getSourceStatuses } from '../src/repositories/sourceRepository.js';
import { getIngestionCursor } from '../src/utils/ingestionCursor.js';

function makeItem(id, title, updatedAt = '2026-05-12T00:00:00.000Z') {
  return {
    id,
    title,
    cover: 'https://example.com/c.jpg',
    summary: 'Real loaded content.',
    type: 'anime',
    tags: [],
    actors: [],
    author: 'AI Discovery',
    ipName: title,
    status: 'completed',
    hotScore: 99,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt,
    source: { provider: 'ai-search', label: 'AI Trending Search', url: `https://example.com/ai-search/${encodeURIComponent(id)}` },
  };
}

test('refreshContentType stores provided loader results and records source run', async () => {
  resetDatabaseForTest(':memory:');
  const result = await refreshContentType('anime', {
    loader: async () => ({
      list: [makeItem('anime:ai-search:99', 'Manual Refresh Anime')],
      pagination: { page: 1, limit: 1, total: 1 },
    }),
  });

  const cached = listCachedContents({ type: 'anime', page: 1, limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(cached.list[0].title, 'Manual Refresh Anime');
});

test('refreshContentType dedupes duplicated ids across multi-page backfill', async () => {
  resetDatabaseForTest(':memory:');

  const duplicated = makeItem('anime:ai-search:dedupe-1', 'Duplicated Anime');
  const unique = makeItem('anime:ai-search:dedupe-2', 'Unique Anime');

  const result = await refreshContentType('anime', {
    pageCount: 2,
    pageSize: 2,
    sortModes: ['hot', 'latest'],
    pageLoader: async ({ page, sort }) => {
      if (sort === 'hot' && page === 1) return { list: [duplicated, unique] };
      if (sort === 'hot' && page === 2) return { list: [duplicated] };
      if (sort === 'latest' && page === 1) return { list: [duplicated, unique] };
      return { list: [] };
    },
  });

  const cached = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot', stale: false });
  assert.equal(result.count, 2);
  assert.equal(cached.list.length, 2);
  assert.deepEqual(
    cached.list.map(item => item.id).sort(),
    ['anime:ai-search:dedupe-1', 'anime:ai-search:dedupe-2']
  );
});

test('refreshContentType keeps successful pages when some pages timeout', async () => {
  resetDatabaseForTest(':memory:');

  const a = makeItem('anime:ai-search:partial-1', 'Partial A');
  const b = makeItem('anime:ai-search:partial-2', 'Partial B');

  const result = await refreshContentType('anime', {
    pageCount: 2,
    pageSize: 2,
    sortModes: ['hot', 'latest'],
    pageLoader: async ({ sort, page }) => {
      if (sort === 'hot' && page === 1) return { list: [a] };
      if (sort === 'hot' && page === 2) throw new Error('upstream timeout');
      if (sort === 'latest' && page === 1) return { list: [b] };
      return { list: [] };
    },
  });

  const cached = listCachedContents({ type: 'anime', page: 1, limit: 10, stale: false });
  const statuses = getSourceStatuses();

  // 第 1 页仅 1 条，小于 pageSize=2，会提前终止该 sort，不会请求 hot/page=2
  assert.equal(result.status, 'success');
  assert.equal(result.count, 2);
  assert.equal(result.partial, false);
  assert.equal(result.failedPages, 0);
  assert.equal(cached.list.length, 2);
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, 'success');
  assert.equal(statuses[0].error, null);
});

test('refreshContentType fails when all pages fail', async () => {
  resetDatabaseForTest(':memory:');

  await assert.rejects(
    () => refreshContentType('anime', {
      pageCount: 2,
      pageSize: 2,
      sortModes: ['hot', 'latest'],
      pageLoader: async () => {
        throw new Error('all upstream timeout');
      },
    }),
    (error) => {
      assert.equal(error.publicCode, 'upstream_unavailable');
      assert.match(error.message, /all upstream timeout/);
      return true;
    }
  );

  const statuses = getSourceStatuses();
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, 'failed');
  assert.equal(statuses[0].count, 0);
});

test('refreshContentType marks partial success when middle page fails but other pages succeed', async () => {
  resetDatabaseForTest(':memory:');

  const item1 = makeItem('anime:ai-search:partial-mid-1', 'Partial Mid 1');
  const item2 = makeItem('anime:ai-search:partial-mid-2', 'Partial Mid 2');
  const item3 = makeItem('anime:ai-search:partial-mid-3', 'Partial Mid 3');

  const result = await refreshContentType('anime', {
    pageCount: 3,
    pageSize: 2,
    sortModes: ['hot'],
    pageLoader: async ({ page }) => {
      if (page === 1) return { list: [item1, item2] };
      if (page === 2) throw new Error('mid page timeout');
      if (page === 3) return { list: [item3] };
      return { list: [] };
    },
  });

  const statuses = getSourceStatuses();
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.equal(result.failedPages, 1);
  assert.equal(result.count, 3);
  assert.match(String(result.warning || ''), /部分分页补采失败/);
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, 'success');
  assert.match(String(statuses[0].error || ''), /部分分页补采失败/);
});

test('refreshContentType uses incremental cursor to skip old pages', async () => {
  resetDatabaseForTest(':memory:');

  await refreshContentType('anime', {
    loader: async () => ({
      list: [
        makeItem('anime:ai-search:old-1', 'Old 1', '2026-05-12T00:00:00.000Z'),
        makeItem('anime:ai-search:old-2', 'Old 2', '2026-05-11T00:00:00.000Z'),
      ],
    }),
  });

  const second = await refreshContentType('anime', {
    pageCount: 1,
    pageSize: 20,
    sortModes: ['latest'],
    pageLoader: async () => ({
      list: [
        makeItem('anime:ai-search:old-1', 'Old 1', '2026-05-12T00:00:00.000Z'),
        makeItem('anime:ai-search:new-1', 'New 1', '2026-05-13T00:00:00.000Z'),
      ],
    }),
  });

  const cursor = getIngestionCursor({ type: 'anime', source: 'ai_search' });
  const cached = listCachedContents({ type: 'anime', page: 1, limit: 20, sort: 'latest', stale: false });

  assert.equal(second.count, 1);
  assert.equal(second.incremental.enabled, true);
  assert.equal(second.incremental.filteredCount, 1);
  assert.equal(cursor?.cursor, 'anime:ai-search:new-1');
  assert.equal(cached.list.length, 3);
});
