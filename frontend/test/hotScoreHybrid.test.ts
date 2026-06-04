import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHotScore, formatHotScoreShort } from '../src/utils/hotScore.ts';

test('hot score formatter uses playback metric by default', () => {
  assert.equal(formatHotScore(440000), '全网播放量 440,000 万次');
  assert.equal(formatHotScore(0), '全网播放量待披露');
});

test('hot score formatter supports reading metric copy', () => {
  assert.equal(formatHotScore(1660000, 'reading'), '全网阅读量 1,660,000 万次');
  assert.equal(formatHotScoreShort(1660000, 'reading'), '阅读量 1,660,000 万次');
});
