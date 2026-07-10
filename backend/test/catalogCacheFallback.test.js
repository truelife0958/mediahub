import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { listContents, resetCatalogRuntimeState } from '../src/services/catalogService.js';
import { buildCuratedRealContents } from '../src/services/curatedRealContentService.js';

const cached = {
  id: 'drama:hongguo:1',
  title: 'Cached Drama',
  cover: 'https://example.com/cover.jpg',
  summary: 'Cached real content.',
  type: 'drama',
  tags: ['Short Drama'],
  actors: [],
  author: 'Hongguo',
  ipName: 'Cached Drama',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/' },
};

test('listContents returns database content directly when cache exists', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({ type: 'drama', page: 1, limit: 10, __skipLiveFetchForTest: true });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, 'Cached Drama');
});

test('listContents returns empty list for keyword miss when cache already has this type', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({
    type: 'drama',
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
    type: 'drama',
    page: 1,
    limit: 10,
    __skipLiveFetchForTest: true,
  });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 0);
  assert.equal(result.pagination.total, 0);
});

test('listContents seeds curated real contents when live platform source is unavailable and cache is empty', async () => {
  resetDatabaseForTest(':memory:');
  const previous = {
    MEDIAHUB_CURATED_REAL_SEED_ENABLED: process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED,
  };
  process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED = 'true';

  try {
    const result = await listContents({
      type: 'novel',
      page: 1,
      limit: 10,
    });

    assert.equal(result.stale, false);
    assert.ok(result.list.length >= 5);
    assert.equal(result.list[0].source.provider, 'curated-cn');
    assert.ok(result.list.every(item => item.source.provider === 'curated-cn'));
    assert.ok(result.list.every(item => !/[A-Za-z]{3,}/.test(item.title)));
    assert.ok(result.list.every(item => !/E2E|冒烟|回归样本|视觉基线|One Piece|Frieren|Dune|Sopranos/i.test(item.title)));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('curated drama seed uses China short dramas ranked by all-network views', async () => {
  resetDatabaseForTest(':memory:');
  const previous = {
    MEDIAHUB_CURATED_REAL_SEED_ENABLED: process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED,
  };
  process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED = 'true';

  try {
    const result = await listContents({
      type: 'drama',
      page: 1,
      limit: 50,
    });

    const titles = result.list.map(item => item.title);
    assert.ok(titles.includes('盛夏芬德拉'));
    assert.ok(titles.includes('家里家外'));
    assert.ok(titles.includes('无双'));
    assert.equal(result.list[0].title, '十八岁太奶奶驾到，重整家族荣耀');
    assert.equal(result.list.find(item => item.title === '盛夏芬德拉')?.hotScore, 300_000);
    assert.equal(result.list.find(item => item.title === '暗潮涌动')?.hotScore, 0);
    assert.equal(result.list.find(item => item.title === '长路初心')?.hotScore, 0);
    assert.equal(result.list.find(item => item.title === '无双')?.hotScore, 0);
    assert.ok(result.list.every(item => item.source.provider === 'curated-cn'));
    assert.ok(result.list.every(item => item.tags.includes('短剧') || item.tags.includes('微短剧')));
    assert.ok(!titles.some(title => ['狂飙', '漫长的季节', '繁花', '庆余年 第二季'].includes(title)));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('curated China novel seeds use all-network reading volume metrics', () => {
  const expectedVolumeByType = {
    novel: {
      '斗破苍穹': 1_000_000,
      '全职高手': 1_000_000,
      '凡人修仙传': 1_000_000,
      '诡秘之主': 10_000,
    },
  };

  for (const [type, expectedByTitle] of Object.entries(expectedVolumeByType)) {
    const list = buildCuratedRealContents(type);
    const byTitle = new Map(list.map(item => [item.title, item]));
    for (const [title, expectedHotScore] of Object.entries(expectedByTitle)) {
      assert.equal(byTitle.get(title)?.hotScore, expectedHotScore, `${type}:${title}`);
      assert.equal(byTitle.get(title)?.source.region, 'CN', `${type}:${title}`);
    }
    assert.ok(list.every(item => item.hotScore === 0 || item.hotScore >= 10_000), `${type} should not use 9000-style heat placeholders`);
  }
});

test('curated drama seed keeps unverified short-drama volume as undisclosed', () => {
  const list = buildCuratedRealContents('drama');
  const byTitle = new Map(list.map(item => [item.title, item]));

  assert.equal(byTitle.get('盛夏芬德拉')?.hotScore, 300_000);
  assert.equal(byTitle.get('暗潮涌动')?.hotScore, 0);
  assert.equal(byTitle.get('长路初心')?.hotScore, 0);
  assert.equal(byTitle.get('无双')?.hotScore, 0);
  assert.match(byTitle.get('暗潮涌动')?.summary ?? '', /播放总量待平台披露/);
  assert.match(byTitle.get('长路初心')?.summary ?? '', /播放总量待平台披露/);
  assert.match(byTitle.get('无双')?.summary ?? '', /播放总量待平台披露/);
});

test('hybrid keyword search ignores unsupported source tokens', async () => {
  resetDatabaseForTest(':memory:');
  resetCatalogRuntimeState();
  const previous = {
    MEDIAHUB_SOURCE_CHAIN_DRAMA: process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA,
  };
  process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA = 'unsupported_source';

  try {
    const result = await listContents({
      type: 'drama',
      keyword: '盛夏芬德拉',
      page: 1,
      limit: 10,
      sort: 'hot',
      searchMode: 'hybrid',
    });
    assert.equal(result.stale, false);
    assert.equal(result.list.some(item => item.source?.provider === 'unsupported_source'), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
