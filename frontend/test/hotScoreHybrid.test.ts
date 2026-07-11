import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHotScore } from '../src/utils/hotScore.ts';

test('hot score formatter uses playback metric by default', () => {
  assert.equal(formatHotScore(44), '热度参考 44');
  assert.equal(formatHotScore(0), '热度参考待核验');
});

test('hot score formatter supports reading metric copy', () => {
  assert.equal(formatHotScore(166, 'reading'), '热度参考 166');
});
