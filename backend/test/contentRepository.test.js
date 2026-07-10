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
  id: 'drama:hongguo:1',
  title: '许你万丈光芒好',
  cover: 'https://example.com/cover.jpg',
  summary: 'Hongguo short drama sample.',
  type: 'drama',
  tags: ['短剧', '甜宠'],
  actors: ['马小宇'],
  characters: ['陆霆骁'],
  author: 'Hongguo',
  ipName: '许你万丈光芒好',
  status: 'completed',
  hotScore: 9000,
  createdAt: '1998-04-03T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/' },
};

test('upsertContents stores and lists stale-capable cached content', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const result = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });
  const detail = getCachedContentById('drama:hongguo:1');

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, sample.id);
  assert.equal(result.list[0].stale, true);
  assert.equal(result.list[0].source.provider, 'hongguo');
  assert.equal(detail.title, sample.title);
  assert.deepEqual(detail.tags, sample.tags);
});

test('listCachedContents excludes non-real test fixtures by default', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    sample,
    {
      ...sample,
      id: 'drama:regression:1',
      title: 'DRAMA regression fixture 1',
      hotScore: 99_999,
      source: { provider: 'regression', label: 'Regression Source', url: 'https://example.com' },
    },
    {
      ...sample,
      id: 'drama:smoke:e2e-1',
      title: 'E2E smoke drama A',
      hotScore: 99_998,
      source: { provider: 'smoke', label: 'Smoke Source', url: 'https://example.com' },
    },
    {
      ...sample,
      id: 'drama:visual:1',
      title: 'DRAMA visual baseline 1',
      hotScore: 99_997,
      source: { provider: 'visual', label: 'Visual Baseline', url: 'https://example.com' },
    },
  ]);

  const result = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });

  assert.equal(result.pagination.total, 1);
  assert.deepEqual(result.list.map(item => item.id), [sample.id]);
});

test('listCachedContents excludes legacy overseas cached providers by default', () => {
  resetDatabaseForTest(':memory:');

  const cnCurated = {
    ...sample,
    id: 'drama:curated-cn:1',
    title: '无双',
    hotScore: 100,
    source: { provider: 'curated-cn', label: '中国真实内容精选', region: 'CN', url: 'https://www.hongguoduanju.com/' },
  };

  upsertContents([
    cnCurated,
    {
      ...sample,
      id: 'drama:curated-real:old-1',
      title: 'Frieren: Beyond Journey’s End',
      hotScore: 99_999,
      source: { provider: 'curated-real', label: 'Curated Real Dataset', url: 'https://example.com/curated-real/old' },
    },
    {
      ...sample,
      id: 'drama:tvmaze:old-1',
      title: 'The Sopranos',
      type: 'drama',
      hotScore: 99_998,
      source: { provider: 'tvmaze', label: 'TVMaze', url: 'https://api.tvmaze.com/shows/527' },
    },
  ]);

  const dramaCurrent = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });
  const drama = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });

  assert.equal(dramaCurrent.pagination.total, 1);
  assert.deepEqual(dramaCurrent.list.map(item => item.title), ['无双']);
  assert.equal(drama.pagination.total, 1);
});

test('listCachedContents still includes test fixtures when explicitly enabled', () => {
  resetDatabaseForTest(':memory:');
  const previous = process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES;
  process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES = 'true';

  try {
    upsertContents([
      {
        ...sample,
        id: 'drama:regression:include-1',
        title: 'DRAMA regression fixture 1',
        source: { provider: 'regression', label: 'Regression Source', url: 'https://example.com' },
      },
      {
        ...sample,
        id: 'drama:curated-real:include-1',
        title: 'Frieren: Beyond Journey’s End',
        hotScore: 99_999,
        source: { provider: 'curated-real', label: 'Curated Real Dataset', url: 'https://example.com/curated-real/include' },
      },
    ]);

    const result = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });

    assert.equal(result.pagination.total, 2);
  } finally {
    if (previous === undefined) delete process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES;
    else process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES = previous;
  }
});

test('FTS search matches multi-token keyword and keeps deterministic pagination', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    {
      ...sample,
      id: 'drama:hongguo:100',
      title: 'dragon king returns',
      summary: 'A return of the king',
      ipName: 'dragon-king',
      hotScore: 200,
    },
    {
      ...sample,
      id: 'drama:hongguo:101',
      title: 'dragon legend',
      summary: 'A king tale',
      ipName: 'dragon-legend',
      hotScore: 150,
    },
    {
      ...sample,
      id: 'drama:hongguo:102',
      title: 'other story',
      summary: 'not relevant',
      ipName: 'other',
      hotScore: 99,
    },
  ]);

  const page1 = listCachedContents({ type: 'drama', page: 1, limit: 1, sort: 'hot', keyword: 'dragon king' });
  const page2 = listCachedContents({ type: 'drama', page: 2, limit: 1, sort: 'hot', keyword: 'dragon king' });

  assert.equal(page1.pagination.total, 2);
  assert.equal(page1.list.length, 1);
  assert.equal(page1.list[0].id, 'drama:hongguo:100');
  assert.equal(page2.list.length, 1);
  assert.equal(page2.list[0].id, 'drama:hongguo:101');
});

test('listCachedContents supports expanded search terms for alias recall', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    {
      ...sample,
      id: 'drama:hongguo:alias-1',
      type: 'drama',
      title: '家里家外',
      summary: '短剧爆款样本',
      ipName: '家里家外',
      hotScore: 3500,
    },
  ]);

  const result = listCachedContents({
    type: 'drama',
    page: 1,
    limit: 10,
    sort: 'hot',
    keyword: '盛夏芬德拉',
    searchTerms: ['盛夏芬德拉', '家里家外'],
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.list[0].title, '家里家外');
});

test('listCachedContents searches actors, characters, tags and ipName locally', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([{
    ...sample,
    id: 'drama:hongguo:character-1',
    title: '盛夏芬德拉',
    type: 'drama',
    tags: ['短剧', '治愈爱情'],
    actors: ['刘萧旭', '郭宇欣'],
    characters: ['周晟安', '白清枚'],
    ipName: '盛夏芬德拉',
    hotScore: 300000,
  }]);

  const byActor = listCachedContents({ type: 'drama', keyword: '郭宇欣', page: 1, limit: 10 });
  const byCharacter = listCachedContents({ type: 'drama', keyword: '周晟安', page: 1, limit: 10 });

  assert.equal(byActor.pagination.total, 1);
  assert.equal(byActor.list[0].title, '盛夏芬德拉');
  assert.equal(byCharacter.pagination.total, 1);
  assert.deepEqual(byCharacter.list[0].characters, ['周晟安', '白清枚']);
});

test('upsertContents dedupes by normalized title + source + ipName', () => {
  resetDatabaseForTest(':memory:');

  const first = {
    ...sample,
    id: 'drama:hongguo:dup-1',
    title: 'Dragon King Returns',
    ipName: 'dragon-king-returns',
    source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/dup-1' },
  };
  const duplicate = {
    ...sample,
    id: 'drama:hongguo:dup-2',
    title: ' Dragon-King Returns ',
    ipName: 'dragon-king-returns',
    source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/dup-2' },
    summary: 'updated summary',
  };

  upsertContents([first]);
  upsertContents([duplicate]);

  const result = listCachedContents({ type: 'drama', page: 1, limit: 20, sort: 'hot' });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, 'drama:hongguo:dup-1');
  assert.equal(result.list[0].summary, 'updated summary');
});

test('tokenizeKeywordForFts builds safe prefix query for FTS5', () => {
  const query = tokenizeKeywordForFts('dragon "king"');
  assert.equal(query, '"dragon"* OR " king "*');
});

test('buildDedupeHash is stable for whitespace and punctuation variants', () => {
  const a = buildDedupeHash({
    type: 'drama',
    title: 'Dragon King Returns',
    ipName: 'same-ip',
    source: { provider: 'hongguo' },
  });
  const b = buildDedupeHash({
    type: 'drama',
    title: ' Dragon-King Returns ',
    ipName: 'same-ip',
    source: { provider: 'hongguo' },
  });

  assert.equal(a, b);
});
