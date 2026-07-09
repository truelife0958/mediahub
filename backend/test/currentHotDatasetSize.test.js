import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function assertDatasetShape(dataset, type) {
  assert.equal(dataset.type, type);
  assert.match(dataset.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dataset.items.length, 100, `${type} should ship with exactly 100 ranked items`);

  const ids = new Set();
  for (const [index, item] of dataset.items.entries()) {
    assert.equal(item.type, type);
    assert.equal(item.rank, index + 1, `${item.id} should have contiguous rank`);
    assert.ok(item.id.startsWith(`${type}:`), `${item.id} should be namespaced`);
    assert.ok(!ids.has(item.id), `${item.id} should be unique`);
    ids.add(item.id);

    assert.ok(String(item.title || '').trim(), `${item.id} missing title`);
    assert.ok(String(item.source || '').trim(), `${item.id} missing source`);
    assert.ok(String(item.sourceName || '').trim(), `${item.id} missing sourceName`);
    assert.ok(Array.isArray(item.categories) && item.categories.length > 0, `${item.id} missing categories`);
    assert.ok(Array.isArray(item.evidence) && item.evidence.length > 0, `${item.id} missing evidence`);
    assert.ok(Array.isArray(item.rankingEvidence), `${type} ${item.title} should include rankingEvidence`);
    assert.ok(item.rankingEvidence.length >= 1, `${type} ${item.title} should have at least one ranking evidence source`);
    assert.ok(item.rankingMeta, `${type} ${item.title} should include rankingMeta`);
    assert.equal(typeof item.rankingMeta.rankingReason, 'string');
    assert.ok(item.rankingMeta.rankingReason.length >= 6, `${type} ${item.title} should explain ranking reason`);
    assert.ok(['high', 'medium', 'low'].includes(item.rankingMeta.sourceConfidence));

    for (const key of ['playOrReadScore', 'platformHeatScore', 'searchIndexScore', 'topicScore', 'totalScore']) {
      assert.ok(Number.isFinite(Number(item.metrics?.[key])), `${item.id} missing metric ${key}`);
    }

    if (type === 'drama') {
      assert.ok(Array.isArray(item.actors) && item.actors.length > 0, `${item.id} missing actors`);
      assert.ok(['duanjubaike', 'baike_public', 'public_search', 'iqiyi_public', 'chinesemov_public', 'hongguo_public'].includes(item.source), `${item.id} should use a verifiable drama source`);
      assert.ok(Array.isArray(item.characters) && item.characters.length > 0, `${item.id} missing cast characters`);
    } else if (type === 'novel') {
      assert.ok(String(item.author || '').trim(), `${item.id} missing author`);
      assert.ok(['qidian', 'baidu_novel'].includes(item.source), `${item.id} should use a verifiable novel source`);
    } else if (type === 'anime') {
      assert.ok(Array.isArray(item.characters), `${item.id} missing characters array`);
      assert.equal(item.source, 'bilibili');
    } else if (type === 'comic') {
      assert.ok(String(item.author || '').trim(), `${item.id} missing author`);
      assert.ok(['tencent_comic'].includes(item.source), `${item.id} should use a verifiable comic source`);
    }
  }
}

function assertRealDatasetHasNoPlaceholders(dataset) {
  const bannedPatterns = [/\u6f14\u5458\u4fe1\u606f\u4ee5\u5e73\u53f0\u9875\u4e3a\u51c6/u, /\u89d2\u8272\u4fe1\u606f\u4ee5\u5e73\u53f0\u9875\u4e3a\u51c6/u, /\?\?\?\?/, /\u66f4\u591a\u5206\u7c7b/u, /\u9000\u51fa/u];
  const syntheticRankPattern = /\s\d{2}$/;

  for (const item of dataset.items) {
    const serialized = JSON.stringify(item);
    for (const pattern of bannedPatterns) {
      assert.doesNotMatch(serialized, pattern, `${item.id} should not contain placeholder data`);
    }
    assert.doesNotMatch(item.title, syntheticRankPattern, `${item.id} should not expose synthetic rank suffix in title`);
    assert.ok(
      item.evidence.some(entry => /^https?:\/\//.test(String(entry.url || ''))),
      `${item.id} should carry public source evidence URL`,
    );
  }
}

test('checked-in current and snapshot hot datasets contain 100 rows per visible module', () => {
  for (const type of ['drama', 'novel', 'anime', 'comic']) {
    const current = readJson(`../../data/current/${type}.json`);
    assertDatasetShape(current, type);

    const snapshot = readJson(`../../data/snapshots/${current.date}/${type}.json`);
    assertDatasetShape(snapshot, type);
    assert.deepEqual(snapshot.items.map(item => item.id), current.items.map(item => item.id));

    if (type === 'drama') {
      const seeds = readJson('../../data/seeds/drama.json');
      assertRealDatasetHasNoPlaceholders({ items: seeds });
      assertRealDatasetHasNoPlaceholders(current);
      assertRealDatasetHasNoPlaceholders(snapshot);
    }
  }
});
