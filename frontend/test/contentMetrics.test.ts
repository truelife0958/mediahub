import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMetricRows,
  formatRealMetricDisplay,
  formatYiMetric,
  getTotalScore,
  hasBrokenText,
} from '../src/utils/contentMetrics.ts';

describe('content metrics helpers', () => {
  it('normalizes four hot-data indicators for playback content', () => {
    const rows = buildMetricRows({
      heatMetric: 'playback',
      metrics: {
        playOrReadScore: 100,
        platformHeatScore: 95,
        searchIndexScore: 0,
        topicScore: 88,
        totalScore: 77.3,
      },
      hotScore: 773000,
    });

    assert.deepEqual(rows.map(row => [row.id, row.label, row.score]), [
      ['playOrRead', '内容', 100],
      ['platformHeat', '平台', 95],
      ['searchIndex', '热搜', 0],
      ['topic', '话题', 88],
    ]);
    assert.equal(getTotalScore({ metrics: { totalScore: 77.3 }, hotScore: 773000 }), 77.3);
  });

  it('uses reading label for novel-like content', () => {
    const rows = buildMetricRows({
      heatMetric: 'reading',
      metrics: { playOrReadScore: 64 },
      hotScore: 640000,
    });

    assert.equal(rows[0].label, '内容');
    assert.equal(rows[0].score, 64);
  });

  it('formats play and reading values in yi units', () => {
    assert.equal(formatYiMetric(10), '10.0 亿');
    assert.equal(formatYiMetric(3.26), '3.26 亿');
    assert.equal(formatYiMetric(0), '--');
    assert.equal(formatYiMetric(undefined), '--');
  });


  it('formats official real playback counts with source metadata', () => {
    assert.deepEqual(formatRealMetricDisplay({
      heatMetric: 'playback',
      metrics: {
        realPlayCount: 126000000,
        realMetricStatus: 'official',
        realMetricCapturedAt: '2026-07-10T00:00:00.000Z',
        realMetricSources: [{
          sourceId: 'official',
          sourceName: '腾讯视频',
          sourceUrl: 'https://example.com/a',
          metricType: 'play',
          value: 126000000,
          unit: 'count',
          method: 'public_page',
          confidence: 'official',
          capturedAt: '2026-07-10T00:00:00.000Z',
        }],
      },
    }), {
      label: '真实播放量',
      value: '1.26亿',
      meta: '来源：腾讯视频 · 采集：2026-07-10',
      status: 'official',
    });
  });

  it('labels trusted third-party reading counts separately', () => {
    const result = formatRealMetricDisplay({
      heatMetric: 'reading',
      metrics: {
        realReadCount: 82340000,
        realMetricStatus: 'trusted_third_party',
        realMetricCapturedAt: '2026-07-10T00:00:00.000Z',
        realMetricSources: [{
          sourceId: 'third',
          sourceName: '第三方监测',
          sourceUrl: 'https://third.example.com/a',
          metricType: 'read',
          value: 82340000,
          unit: 'count',
          method: 'third_party',
          confidence: 'trusted_third_party',
          capturedAt: '2026-07-10T00:00:00.000Z',
        }],
      },
    });

    assert.equal(result.label, '第三方阅读量');
    assert.equal(result.value, '8234万');
    assert.equal(result.status, 'trusted_third_party');
  });

  it('does not use score fields as real playback or reading counts', () => {
    assert.deepEqual(formatRealMetricDisplay({
      heatMetric: 'playback',
      metrics: {
        playOrReadYi: 99,
        playOrReadScore: 88,
        totalScore: 77,
      },
    }), {
      label: '播放量参考',
      value: '未公开',
      meta: '真实数据未公开',
      status: 'unavailable',
    });
  });

  it('detects mojibake without hiding valid Chinese titles', () => {
    assert.equal(hasBrokenText('许你万丈光芒好'), false);
    assert.equal(hasBrokenText('都市爱情 · 复仇逆袭'), false);
    assert.equal(hasBrokenText('璁镐綘涓囦笀鍏夎姃濂?'), true);
    assert.equal(hasBrokenText('閿熸枻鎷风煭鍓?'), true);
    assert.equal(hasBrokenText('閸愬懎顔愭稉宥呯摠閸?'), true);
    assert.equal(hasBrokenText('鍐呭涓嶅瓨鍦'), true);
  });
});
