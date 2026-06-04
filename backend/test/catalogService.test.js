import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError } from '../src/utils/apiErrors.js';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { createSearchAliasGroup } from '../src/services/searchAliasService.js';

test('createApiError exposes stable http status and public code', () => {
  const err = createApiError('upstream_rate_limited', 'AI search rate limited');

  assert.equal(err.statusCode, 429);
  assert.equal(err.publicCode, 'upstream_rate_limited');
  assert.equal(err.message, 'AI search rate limited');
});

import { parseContentId } from '../src/services/catalogService.js';
import { listContents } from '../src/services/catalogService.js';

test('parseContentId rejects fallback provider ids', () => {
  assert.throws(
    () => parseContentId('anime:fallback:1'),
    /Unsupported content source/
  );
});

test('catalog service expands alias search terms for local recall', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([{
    id: 'drama:ai-search:alias-1',
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
    source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/drama/1' },
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
