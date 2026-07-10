import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError } from '../src/utils/apiErrors.js';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { createSearchAliasGroup } from '../src/services/searchAliasService.js';

test('createApiError exposes stable http status and public code', () => {
  const err = createApiError('upstream_rate_limited', 'Platform source rate limited');

  assert.equal(err.statusCode, 429);
  assert.equal(err.publicCode, 'upstream_rate_limited');
  assert.equal(err.message, 'Platform source rate limited');
});

import { parseContentId } from '../src/services/catalogService.js';
import { fetchListByType, getCatalogCacheStats, listContents, listTopicContents } from '../src/services/catalogService.js';

test('parseContentId rejects fallback provider ids', () => {
  assert.throws(
    () => parseContentId('drama:fallback:1'),
    /Unsupported content source/
  );
});

test('catalog service expands alias search terms for local recall', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([{
    id: 'drama:hongguo:alias-1',
    title: '家里家外',
    cover: 'https://example.com/cover.jpg',
    summary: '短剧内容样本',
    type: 'drama',
    tags: ['短剧'],
    actors: ['演员A'],
    author: '平台',
    ipName: '家里家外',
    status: 'completed',
    hotScore: 4200,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/drama/1' },
  }]);
  createSearchAliasGroup({
    canonicalKeyword: '家里家外',
    aliases: ['盛夏芬德拉'],
    type: 'drama',
    enabled: true,
  });

  const result = await listContents({
    type: 'drama',
    keyword: '盛夏芬德拉',
    searchMode: 'local',
  });

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, '家里家外');
});

test('catalog service lists character topic contents', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([{
    id: 'drama:hongguo:character-topic-1',
    title: '盛夏芬德拉',
    cover: 'https://example.com/cover.jpg',
    summary: '短剧内容样本',
    type: 'drama',
    tags: ['短剧'],
    actors: ['刘萧旭'],
    characters: ['周晟安', '白清枚'],
    author: '平台',
    ipName: '盛夏芬德拉',
    status: 'completed',
    hotScore: 300000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/drama/character' },
  }]);

  const result = await listTopicContents({
    field: 'character',
    value: '周晟安',
    type: 'drama',
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.list[0].title, '盛夏芬德拉');
});

test('catalog service lists category topic contents from cached tags', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([{
    id: 'drama:hongguo:category-topic-1',
    title: '许你万丈光芒好',
    cover: 'https://example.com/cover.jpg',
    summary: '红果短剧热榜内容样本',
    type: 'drama',
    tags: ['娱乐圈逆袭', '霸总甜宠'],
    actors: ['余茵'],
    characters: ['宁夕'],
    author: '红果短剧',
    ipName: '许你万丈光芒好',
    status: 'completed',
    hotScore: 770000,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T08:00:00.000Z',
    source: { provider: 'hongguo', label: '红果短剧', url: 'https://www.hongguoduanju.com/' },
  }]);

  const result = await listTopicContents({
    field: 'category',
    value: '娱乐圈逆袭',
    type: 'drama',
  });

  assert.equal(result.field, 'category');
  assert.equal(result.pagination.total, 1);
  assert.equal(result.list[0].title, '许你万丈光芒好');
});

test('catalog service cache is bounded under high-cardinality searches', async () => {
  resetDatabaseForTest(':memory:');

  for (let index = 0; index < 650; index += 1) {
    await fetchListByType({
      type: 'drama',
      keyword: `cache-key-${index}`,
      sourceChain: ['empty_source'],
    });
  }

  const stats = getCatalogCacheStats();
  assert.ok(stats.size <= stats.maxEntries);
  assert.equal(stats.maxEntries, 500);
});

test('catalog service ignores unsupported source-chain tokens', async () => {
  resetDatabaseForTest(':memory:');

  const result = await fetchListByType({
    type: 'drama',
    keyword: 'unsupported-source',
    sourceChain: ['unsupported_source'],
  });

  assert.deepEqual(result.list, []);
  assert.equal(result.pagination.total, 0);
  assert.equal(result.resolvedSource, null);
});
