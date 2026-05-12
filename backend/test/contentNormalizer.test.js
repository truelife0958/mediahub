import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent } from '../src/services/contentNormalizer.js';

test('normalizeContent preserves real source metadata and required fields', () => {
  const result = normalizeContent({
    id: 'anime:jikan:1',
    title: 'Cowboy Bebop',
    cover: 'https://example.com/cover.jpg',
    summary: 'Space bounty hunters.',
    type: 'anime',
    tags: ['Action'],
    actors: ['Sunrise'],
    author: 'Original',
    ipName: 'Cowboy Bebop',
    status: 'completed',
    hotScore: 9000,
    createdAt: '1998-04-03T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    source: {
      provider: 'jikan',
      label: 'Jikan',
      url: 'https://api.jikan.moe/v4/anime/1',
    },
  });

  assert.equal(result.id, 'anime:jikan:1');
  assert.equal(result.source.provider, 'jikan');
  assert.equal(result.source.label, 'Jikan');
  assert.equal(result.source.url, 'https://api.jikan.moe/v4/anime/1');
  assert.deepEqual(result.tags, ['Action']);
});
