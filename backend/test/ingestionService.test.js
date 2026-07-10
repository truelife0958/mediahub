import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { refreshContentType } from '../src/services/ingestionService.js';
import { listCachedContents } from '../src/repositories/contentRepository.js';
import { getSourceStatuses } from '../src/repositories/sourceRepository.js';
import { getIngestionCursor } from '../src/utils/ingestionCursor.js';
import { readCurrentDataset } from '../src/store/jsonStore.js';

function makeItem(id, title, updatedAt = '2026-05-12T00:00:00.000Z') {
  return {
    id,
    title,
    cover: 'https://example.com/c.jpg',
    summary: 'Real loaded content.',
    type: 'drama',
    tags: [],
    actors: [],
    author: 'Hongguo',
    ipName: title,
    status: 'completed',
    hotScore: 99,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt,
    source: { provider: 'hongguo', label: 'Hongguo', url: `https://www.hongguoduanju.com/${encodeURIComponent(id)}` },
  };
}

test('refreshContentType stores provided loader results and records source run', async () => {
  resetDatabaseForTest(':memory:');
  const result = await refreshContentType('drama', {
    loader: async () => ({
      list: [makeItem('drama:hongguo:99', 'Manual Refresh Drama')],
      pagination: { page: 1, limit: 1, total: 1 },
    }),
  });

  const cached = listCachedContents({ type: 'drama', page: 1, limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(cached.list[0].title, 'Manual Refresh Drama');
});

test('refreshContentType uses target platform loader by default', async () => {
  resetDatabaseForTest(':memory:');
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-target-refresh-'));
  const previousDataDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  const previousFetch = globalThis.fetch;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  globalThis.fetch = async () => {
    throw new Error('network disabled in test');
  };

  try {
    const result = await refreshContentType('drama', {
      targetLoader: async () => ({
        list: [
          {
            id: 'drama:hongguo:xuniwanzhangguangmanghao',
            type: 'drama',
            title: '许你万丈光芒好',
            source: 'hongguo',
            sourceName: '红果短剧',
            sourceUrl: 'https://www.hongguoduanju.com/',
            actors: ['马小宇', '余茵'],
            ipName: '许你万丈光芒好',
            categories: ['真千金复仇', '霸总甜宠'],
            summary: '红果短剧公开热榜数据。',
            metrics: {
              playOrReadYi: 10,
              platformHeatWan: 7445,
              searchIndex: 0,
              topicPlayYi: 3.2,
            },
            capturedAt: '2026-06-20T08:00:00.000Z',
          },
        ],
      }),
    });

    const cached = listCachedContents({ type: 'drama', page: 1, limit: 10, stale: false });
    const statuses = getSourceStatuses();

    assert.equal(result.count, 1);
    assert.equal(result.source, 'hongguo');
    assert.equal(cached.list[0].title, '许你万丈光芒好');
    assert.equal(cached.list[0].source.provider, 'hongguo');
    assert.ok(cached.list[0].tags.includes('真千金复仇'));
    assert.equal(statuses[0].source, 'hongguo');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshContentType enriches target platform items with supplemental hot signals', async () => {
  resetDatabaseForTest(':memory:');
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-signal-refresh-'));
  const previousDataDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;

  try {
    const result = await refreshContentType('drama', {
      incremental: false,
      targetLoader: async () => ({
        list: [
          {
            id: 'drama:hongguo:xuniwanzhang',
            type: 'drama',
            title: '许你万丈光芒好',
            source: 'hongguo',
            sourceName: '红果短剧',
            sourceUrl: 'https://www.hongguoduanju.com/',
            actors: ['马小宇', '余茵'],
            ipName: '许你万丈光芒好',
            categories: ['复仇', '甜宠'],
            summary: '红果短剧公开榜单作品。',
            metrics: {
              playOrReadYi: 10,
              platformHeatWan: 7445,
            },
            capturedAt: '2026-06-20T08:00:00.000Z',
          },
        ],
      }),
      signalLoader: async () => ({
        signals: [
          { platform: 'baidu', platformName: '百度热搜', keyword: '许你万丈光芒好', rank: 1, searchIndex: 9820 },
          { platform: 'weibo', platformName: '微博热搜', keyword: '余茵 新剧', rank: 2, heatValue: 368000, topicSignalScore: 92 },
          { platform: 'douyin', platformName: '抖音热点', keyword: '许你万丈光芒好', rank: 3, topicPlayYi: 3.2 },
        ],
      }),
    });

    const dataset = await readCurrentDataset('drama', { dataDir });
    const item = dataset.items[0];

    assert.equal(result.count, 1);
    assert.equal(item.metrics.searchIndex, 9820);
    assert.equal(item.metrics.topicPlayYi, 3.2);
    assert.equal(item.metrics.topicSignalScore, 92);
    assert.ok(item.evidence.some(entry => entry.label === '百度热搜 #1'));
    assert.ok(item.evidence.some(entry => entry.label === '抖音热点 #3'));
  } finally {
    if (previousDataDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshContentType dedupes duplicated ids across multi-page backfill', async () => {
  resetDatabaseForTest(':memory:');

  const duplicated = makeItem('drama:hongguo:dedupe-1', 'Duplicated Drama');
  const unique = makeItem('drama:hongguo:dedupe-2', 'Unique Drama');

  const result = await refreshContentType('drama', {
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

  const cached = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot', stale: false });
  assert.equal(result.count, 2);
  assert.equal(cached.list.length, 2);
  assert.deepEqual(
    cached.list.map(item => item.id).sort(),
    ['drama:hongguo:dedupe-1', 'drama:hongguo:dedupe-2']
  );
});

test('refreshContentType keeps successful pages when some pages timeout', async () => {
  resetDatabaseForTest(':memory:');

  const a = makeItem('drama:hongguo:partial-1', 'Partial A');
  const b = makeItem('drama:hongguo:partial-2', 'Partial B');

  const result = await refreshContentType('drama', {
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

  const cached = listCachedContents({ type: 'drama', page: 1, limit: 10, stale: false });
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
    () => refreshContentType('drama', {
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

  const item1 = makeItem('drama:hongguo:partial-mid-1', 'Partial Mid 1');
  const item2 = makeItem('drama:hongguo:partial-mid-2', 'Partial Mid 2');
  const item3 = makeItem('drama:hongguo:partial-mid-3', 'Partial Mid 3');

  const result = await refreshContentType('drama', {
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

  await refreshContentType('drama', {
    loader: async () => ({
      list: [
        makeItem('drama:hongguo:old-1', 'Old 1', '2026-05-12T00:00:00.000Z'),
        makeItem('drama:hongguo:old-2', 'Old 2', '2026-05-11T00:00:00.000Z'),
      ],
    }),
  });

  const second = await refreshContentType('drama', {
    pageCount: 1,
    pageSize: 20,
    sortModes: ['latest'],
    pageLoader: async () => ({
      list: [
        makeItem('drama:hongguo:old-1', 'Old 1', '2026-05-12T00:00:00.000Z'),
        makeItem('drama:hongguo:new-1', 'New 1', '2026-05-13T00:00:00.000Z'),
      ],
    }),
  });

  const cursor = getIngestionCursor({ type: 'drama', source: 'platform_hot' });
  const cached = listCachedContents({ type: 'drama', page: 1, limit: 20, sort: 'latest', stale: false });

  assert.equal(second.count, 1);
  assert.equal(second.incremental.enabled, true);
  assert.equal(second.incremental.filteredCount, 1);
  assert.equal(cursor?.cursor, 'drama:hongguo:new-1');
  assert.equal(cached.list.length, 3);
});
