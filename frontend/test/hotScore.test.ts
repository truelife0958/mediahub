import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatHotScore } from '../src/utils/hotScore.ts';

describe('formatHotScore', () => {
  it('formats positive values with zh-CN separators', () => {
    assert.equal(formatHotScore(99_999), '全网播放量 99,999 万次');
    assert.equal(formatHotScore(19_998.4), '全网播放量 19,998 万次');
  });

  it('falls back to pending disclosure for zero or invalid values', () => {
    assert.equal(formatHotScore(0), '全网播放量待披露');
    assert.equal(formatHotScore(Number.NaN), '全网播放量待披露');
  });
});
