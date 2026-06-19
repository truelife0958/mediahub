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
  characters: ['Spike Spiegel'],
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

test('listCachedContents excludes non-real test fixtures by default', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    sample,
    {
      ...sample,
      id: 'anime:regression:1',
      title: 'ANIME 回归样本 1',
      hotScore: 99_999,
      source: { provider: 'regression', label: 'Regression Source', url: 'https://example.com' },
    },
    {
      ...sample,
      id: 'anime:smoke:e2e-1',
      title: 'E2E 冒烟动漫 A',
      hotScore: 99_998,
      source: { provider: 'smoke', label: 'Smoke Source', url: 'https://example.com' },
    },
    {
      ...sample,
      id: 'anime:visual:1',
      title: 'ANIME 视觉基线 1',
      hotScore: 99_997,
      source: { provider: 'visual', label: 'Visual Baseline', url: 'https://example.com' },
    },
  ]);

  const result = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });

  assert.equal(result.pagination.total, 1);
  assert.deepEqual(result.list.map(item => item.id), [sample.id]);
});

test('listCachedContents excludes legacy overseas cached providers by default', () => {
  resetDatabaseForTest(':memory:');

  const cnCurated = {
    ...sample,
    id: 'anime:curated-cn:1',
    title: '凡人修仙传',
    hotScore: 100,
    source: { provider: 'curated-cn', label: '中国真实内容精选', region: 'CN', url: 'https://www.bilibili.com/bangumi/' },
  };

  upsertContents([
    cnCurated,
    {
      ...sample,
      id: 'anime:curated-real:old-1',
      title: 'Frieren: Beyond Journey’s End',
      hotScore: 99_999,
      source: { provider: 'curated-real', label: 'Curated Real Dataset', url: 'https://frieren-anime.jp/' },
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

  const anime = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });
  const drama = listCachedContents({ type: 'drama', page: 1, limit: 10, sort: 'hot' });

  assert.equal(anime.pagination.total, 1);
  assert.deepEqual(anime.list.map(item => item.title), ['凡人修仙传']);
  assert.equal(drama.pagination.total, 0);
});

test('listCachedContents still includes test fixtures when explicitly enabled', () => {
  resetDatabaseForTest(':memory:');
  const previous = process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES;
  process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES = 'true';

  try {
    upsertContents([
      {
        ...sample,
        id: 'anime:regression:include-1',
        title: 'ANIME 回归样本 1',
        source: { provider: 'regression', label: 'Regression Source', url: 'https://example.com' },
      },
      {
        ...sample,
        id: 'anime:curated-real:include-1',
        title: 'Frieren: Beyond Journey’s End',
        hotScore: 99_999,
        source: { provider: 'curated-real', label: 'Curated Real Dataset', url: 'https://frieren-anime.jp/' },
      },
    ]);

    const result = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });

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

test('listCachedContents supports expanded search terms for alias recall', () => {
  resetDatabaseForTest(':memory:');

  upsertContents([
    {
      ...sample,
      id: 'drama:ai-search:alias-1',
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
    id: 'drama:ai-search:character-1',
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
  assert.equal(query, '"dragon"* OR " king "*');
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
