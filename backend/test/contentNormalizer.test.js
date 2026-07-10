import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent } from '../src/services/contentNormalizer.js';

test('normalizeContent preserves real source metadata and required fields', () => {
  const result = normalizeContent({
    id: 'drama:hongguo:1',
    title: '许你万丈光芒好',
    cover: 'https://example.com/cover.jpg',
    summary: 'Hongguo short drama sample.',
    type: 'drama',
    tags: ['短剧'],
    actors: ['马小宇'],
    author: 'Hongguo',
    ipName: '许你万丈光芒好',
    status: 'completed',
    hotScore: 9000,
    createdAt: '1998-04-03T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    source: {
      provider: 'hongguo',
      label: 'Hongguo',
      url: 'https://www.hongguoduanju.com/',
      region: 'CN',
    },
  });

  assert.equal(result.id, 'drama:hongguo:1');
  assert.equal(result.source.provider, 'hongguo');
  assert.equal(result.source.label, 'Hongguo');
  assert.equal(result.source.url, 'https://www.hongguoduanju.com/');
  assert.equal(result.source.region, 'CN');
  assert.deepEqual(result.tags, ['短剧']);
  assert.equal(result.heatMetric, 'playback');
});

test('normalizeContent maps heatMetric by content type when omitted', () => {
  const drama = normalizeContent({ id: 'drama:hongguo:1', type: 'drama', title: '短剧样本' });
  const novel = normalizeContent({ id: 'novel:fanqie:1', type: 'novel', title: '小说样本' });

  assert.equal(drama.heatMetric, 'playback');
  assert.equal(novel.heatMetric, 'reading');
});
