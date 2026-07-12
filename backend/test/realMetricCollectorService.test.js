import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFetchTextWithRetry,
  collectRealMetricsForItem,
  enrichItemsWithRealMetrics,
  extractRealMetricSourcesFromJson,
  extractRealMetricSourcesFromText,
  getReliableMetricSourceCandidates,
  normalizeCountMetric,
  selectRealMetricPatch,
} from '../src/services/realMetricCollectorService.js';

test('normalizeCountMetric parses Chinese count units into integer counts', () => {
  assert.equal(normalizeCountMetric('123'), 123);
  assert.equal(normalizeCountMetric('1.5万'), 15_000);
  assert.equal(normalizeCountMetric('2.3亿'), 230_000_000);
  assert.equal(normalizeCountMetric('1,234.5万次'), 12_345_000);
  assert.equal(normalizeCountMetric('热度 9800万'), null);
  assert.equal(normalizeCountMetric('热度值 9800'), null);
});

test('extractRealMetricSourcesFromText extracts explicit official play and read labels only', () => {
  const capturedAt = '2026-07-10T00:00:00.000Z';
  const playSources = extractRealMetricSourcesFromText({
    text: '累计播放量 1.26亿 点赞 20万 热度 9800',
    metricType: 'play',
    sourceId: 'official_video',
    sourceName: '公开视频页',
    sourceUrl: 'https://example.com/video/1',
    capturedAt,
    confidence: 'official',
    method: 'public_page',
  });
  const readSources = extractRealMetricSourcesFromText({
    text: '总阅读 8234万 月票 12万 推荐票 30万',
    metricType: 'read',
    sourceId: 'official_novel',
    sourceName: '官方小说页',
    sourceUrl: 'https://example.com/book/1',
    capturedAt,
    confidence: 'official',
    method: 'public_page',
  });

  assert.equal(playSources.length, 1);
  assert.equal(playSources[0].value, 126_000_000);
  assert.equal(playSources[0].metricType, 'play');
  assert.equal(playSources[0].confidence, 'official');
  assert.equal(readSources.length, 1);
  assert.equal(readSources[0].value, 82_340_000);
  assert.equal(readSources[0].metricType, 'read');
});

test('extractRealMetricSourcesFromJson extracts explicit play/read keys and ignores heat keys', () => {
  const sources = extractRealMetricSourcesFromJson({
    json: {
      data: {
        playCount: 4560000,
        read_count: '789万',
        hotScore: 9800,
        heatValue: '3.2亿',
      },
    },
    sourceId: 'json_source',
    sourceName: 'JSON来源',
    sourceUrl: 'https://example.com/state',
    capturedAt: '2026-07-10T00:00:00.000Z',
    confidence: 'official',
  });

  assert.equal(sources.find(item => item.metricType === 'play')?.value, 4_560_000);
  assert.equal(sources.find(item => item.metricType === 'read')?.value, 7_890_000);
  assert.equal(sources.some(item => item.value === 320_000_000), false);
});

test('selectRealMetricPatch prefers official source over trusted third-party source', () => {
  const capturedAt = '2026-07-10T00:00:00.000Z';
  const patch = selectRealMetricPatch([
    {
      sourceId: 'third_party',
      sourceName: '第三方榜单',
      sourceUrl: 'https://third.example.com/a',
      metricType: 'play',
      value: 200_000_000,
      unit: 'count',
      method: 'third_party',
      confidence: 'trusted_third_party',
      capturedAt,
    },
    {
      sourceId: 'official',
      sourceName: '官方公开页',
      sourceUrl: 'https://official.example.com/a',
      metricType: 'play',
      value: 120_000_000,
      unit: 'count',
      method: 'public_page',
      confidence: 'official',
      capturedAt,
    },
  ], 'play');

  assert.equal(patch.realPlayCount, 120_000_000);
  assert.equal(patch.realMetricStatus, 'official');
  assert.equal(patch.realMetricSources.length, 2);
});

test('collectRealMetricsForItem returns unavailable when no explicit real metric exists', async () => {
  const patch = await collectRealMetricsForItem({
    item: {
      type: 'drama',
      title: '无公开播放量作品',
      source: 'official',
      sourceName: '官方页',
      sourceUrl: 'https://example.com/no-metric',
      summary: '热度 9800 排名 1',
    },
    fetchText: async () => '热度 9800 排名 1 点赞 20万',
    now: new Date('2026-07-10T00:00:00.000Z'),
  });

  assert.equal(patch.realMetricStatus, 'unavailable');
  assert.equal(patch.realPlayCount, undefined);
  assert.deepEqual(patch.realMetricSources, []);
});

test('enrichItemsWithRealMetrics keeps ingestion alive when one collector fails', async () => {
  const result = await enrichItemsWithRealMetrics([
    {
      id: 'drama:a',
      type: 'drama',
      title: 'A',
      source: 'official',
      sourceName: '官方页',
      sourceUrl: 'https://example.com/a',
      summary: '累计播放量 2万',
      metrics: {},
    },
    {
      id: 'drama:b',
      type: 'drama',
      title: 'B',
      source: 'official',
      sourceName: '官方页',
      sourceUrl: 'https://example.com/fail',
      summary: '',
      metrics: {},
    },
  ], {
    fetchText: async (url) => {
      if (url.includes('fail')) throw new Error('blocked');
      return '累计播放量 3万';
    },
    now: new Date('2026-07-10T00:00:00.000Z'),
  });

  assert.equal(result.list.length, 2);
  assert.equal(result.list[0].metrics.realPlayCount, 30_000);
  assert.equal(result.list[1].metrics.realMetricStatus, 'unavailable');
  assert.equal(result.errors.length, 1);
});


test('getReliableMetricSourceCandidates builds official and trusted fallback source chain', () => {
  const candidates = getReliableMetricSourceCandidates({
    type: 'drama',
    title: '可靠来源作品',
    source: 'hongguo',
    sourceName: '红果短剧',
    sourceUrl: 'https://www.hongguoduanju.com/detail/1',
    realMetricSourceCandidates: [
      {
        sourceId: 'maoyan',
        sourceName: '猫眼专业版',
        sourceUrl: 'https://piaofang.maoyan.com/drama/1',
        metricType: 'play',
      },
      {
        sourceId: 'random_heat_board',
        sourceName: '随机热度站',
        sourceUrl: 'https://random.example.com/a',
        metricType: 'play',
      },
    ],
  });

  assert.equal(candidates[0].confidence, 'official');
  assert.equal(candidates[0].method, 'public_page');
  // The self-media auto candidate for hongguoduanju is now at index 1
  assert.equal(candidates[1].confidence, 'trusted_third_party');
  assert.equal(candidates[1].method, 'public_page');
  // The maoyan candidate from realMetricSourceCandidates is at index 2
  assert.equal(candidates[2].confidence, 'trusted_third_party');
  assert.equal(candidates[2].method, 'third_party');
  assert.equal(candidates.some(item => item.sourceId === 'random_heat_board'), false);
});

test('collectRealMetricsForItem reads official public api before third-party fallback', async () => {
  const patch = await collectRealMetricsForItem({
    item: {
      type: 'drama',
      title: '?? API ??',
      source: 'hongguo',
      sourceName: '红果短剧',
      sourceUrl: 'https://www.hongguoduanju.com/detail/1',
      summary: '',
      realMetricSourceCandidates: [
        {
          sourceId: 'hongguo_api',
          sourceName: '红果短剧公开接口',
          sourceUrl: 'https://www.hongguoduanju.com/api/detail/1',
          metricType: 'play',
          confidence: 'official',
          method: 'public_api',
        },
        {
          sourceId: 'maoyan',
          sourceName: '猫眼专业版',
          sourceUrl: 'https://piaofang.maoyan.com/drama/1',
          metricType: 'play',
          confidence: 'trusted_third_party',
          method: 'third_party',
        },
      ],
    },
    fetchJson: async (url) => {
      assert.equal(url, 'https://www.hongguoduanju.com/api/detail/1');
      return { data: { playCount: 88_000_000, heatValue: 9999 } };
    },
    fetchText: async (url) => {
      if (url.includes('maoyan')) return '累计播放量 1.2亿';
      return '?? 9800';
    },
    now: new Date('2026-07-10T00:00:00.000Z'),
  });

  assert.equal(patch.realMetricStatus, 'official');
  assert.equal(patch.realPlayCount, 88_000_000);
  assert.equal(patch.realMetricSources.some(item => item.confidence === 'trusted_third_party'), true);
});

test('collectRealMetricsForItem falls back to trusted third-party when official sources hide counts', async () => {
  const patch = await collectRealMetricsForItem({
    item: {
      type: 'drama',
      title: '第三方兜底作品',
      source: 'hongguo',
      sourceName: '红果短剧',
      sourceUrl: 'https://www.hongguoduanju.com/detail/2',
      summary: '?? 9800',
      realMetricSourceCandidates: [
        {
          sourceId: 'maoyan',
          sourceName: '猫眼专业版',
          sourceUrl: 'https://piaofang.maoyan.com/drama/2',
          metricType: 'play',
          confidence: 'trusted_third_party',
          method: 'third_party',
        },
      ],
    },
    fetchText: async (url) => {
      if (url.includes('hongguoduanju')) return '站内热度 9800 排名 1';
      return '累计播放量 5600万';
    },
    now: new Date('2026-07-10T00:00:00.000Z'),
  });

  assert.equal(patch.realMetricStatus, 'trusted_third_party');
  assert.equal(patch.realPlayCount, 56_000_000);
  assert.equal(patch.realMetricSources[0].method, 'third_party');
});

test('buildFetchTextWithRetry returns a function and degrades gracefully on failure', async () => {
  const fetchText = buildFetchTextWithRetry({ maxRetries: 2, baseDelayMs: 10, timeoutMs: 500 });
  assert.equal(typeof fetchText, 'function');

  // Test with a URL that will fail (invalid host)
  const result = await fetchText('http://localhost.invalid.nonexistent.example.com/page');
  assert.equal(result, null);
});

test('getReliableMetricSourceCandidates adds self-media fetch candidate for known platform URLs', () => {
  const candidates = getReliableMetricSourceCandidates({
    type: 'drama',
    source: { provider: 'hongguo', url: 'https://www.hongguoduanju.com/detail/123' },
    sourceName: '红果短剧',
    summary: '短剧描述',
  });

  // Should have: 1) inline text candidate (official, primary), 2) self-media fetch candidate (trusted_third_party)
  const fetchCandidates = candidates.filter(c => !c.text);
  assert.ok(fetchCandidates.length > 0, 'should have at least one fetch candidate for known platform URL');

  const selfMediaCandidate = fetchCandidates.find(c => c.confidence === 'trusted_third_party');
  assert.ok(selfMediaCandidate, 'should have a trusted_third_party candidate from self-media catalog');
  assert.equal(selfMediaCandidate.sourceId, 'hongguoduanju');
  assert.equal(selfMediaCandidate.sourceUrl, 'https://www.hongguoduanju.com/detail/123');
});
