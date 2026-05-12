import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { refreshContentType } from '../src/services/ingestionService.js';
import { listCachedContents } from '../src/repositories/contentRepository.js';

test('refreshContentType stores provided loader results and records source run', async () => {
  resetDatabaseForTest(':memory:');
  const result = await refreshContentType('anime', {
    loader: async () => ({
      list: [{
        id: 'anime:jikan:99', title: 'Manual Refresh Anime', cover: 'https://example.com/c.jpg',
        summary: 'Real loaded content.', type: 'anime', tags: [], actors: [], author: 'Jikan',
        ipName: 'Manual Refresh Anime', status: 'completed', hotScore: 99,
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z',
        source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/99' },
      }],
      pagination: { page: 1, limit: 1, total: 1 },
    }),
  });

  const cached = listCachedContents({ type: 'anime', page: 1, limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(cached.list[0].title, 'Manual Refresh Anime');
});
