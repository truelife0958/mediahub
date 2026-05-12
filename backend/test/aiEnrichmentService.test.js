import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichPublicContent } from '../src/services/aiEnrichmentService.js';

test('enrichPublicContent extracts simple tags and summary from public text', async () => {
  const result = await enrichPublicContent({
    title: '星际赏金猎人',
    text: '这是一部科幻 动作 动漫，讲述赏金猎人在宇宙中的冒险。'.repeat(8),
    type: 'anime',
    sourceUrl: 'https://example.com/public-page',
  });

  assert.equal(result.title, '星际赏金猎人');
  assert.equal(result.type, 'anime');
  assert.ok(result.summary.length > 10);
  assert.ok(result.tags.length > 0);
});

test('enrichPublicContent rejects empty public text', async () => {
  await assert.rejects(
    () => enrichPublicContent({ title: 'Empty', text: '', type: 'novel', sourceUrl: 'https://example.com/empty' }),
    /公开页面文本不足/
  );
});
