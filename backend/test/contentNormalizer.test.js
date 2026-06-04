import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent } from '../src/services/contentNormalizer.js';

test('normalizeContent preserves real source metadata and required fields', () => {
  const result = normalizeContent({
    id: 'anime:ai-search:1',
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
      provider: 'ai-search',
      label: 'AI Discovery',
      url: 'https://example.com/ai-search/1',
      region: 'CN',
    },
  });

  assert.equal(result.id, 'anime:ai-search:1');
  assert.equal(result.source.provider, 'ai-search');
  assert.equal(result.source.label, 'AI Discovery');
  assert.equal(result.source.url, 'https://example.com/ai-search/1');
  assert.equal(result.source.region, 'CN');
  assert.deepEqual(result.tags, ['Action']);
  assert.equal(result.heatMetric, 'playback');
});

test('normalizeContent maps heatMetric by content type when omitted', () => {
  const drama = normalizeContent({ id: 'drama:ai-search:1', type: 'drama', title: '短剧样本' });
  const novel = normalizeContent({ id: 'novel:ai-search:1', type: 'novel', title: '小说样本' });

  assert.equal(drama.heatMetric, 'playback');
  assert.equal(novel.heatMetric, 'reading');
});
