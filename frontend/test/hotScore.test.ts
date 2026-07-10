import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatHotScore, formatHotScoreShort } from '../src/utils/hotScore.ts';

describe('formatHotScore', () => {
  it('does not present estimated heat inputs as real play or read volume', () => {
    assert.equal(formatHotScore(10), '热度参考 10');
    assert.equal(formatHotScore(3.26), '热度参考 3.26');
    assert.equal(formatHotScoreShort(166, 'reading'), '热度参考 166');
  });

  it('falls back to pending disclosure for zero or invalid values', () => {
    assert.equal(formatHotScore(0), '热度参考待核验');
    assert.equal(formatHotScore(Number.NaN), '热度参考待核验');
    assert.equal(formatHotScoreShort(undefined, 'reading'), '热度参考待核验');
  });
});
