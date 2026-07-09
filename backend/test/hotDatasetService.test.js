import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { calculateCompositeScore } from '../src/store/scoreCalculator.js';
import {
  listHotDatasetContents,
  refreshHotDataset,
  getHotDatasetContentById,
  listHotDatasetTopicContents,
  getHotDatasetPreview,
  buildDataset,
} from '../src/services/hotDatasetService.js';

function makeDramaSeed(overrides = {}) {
  return {
    id: 'drama:hongguo:alpha',
    type: 'drama',
    title: 'Alpha Drama',
    source: 'hongguo',
    sourceName: 'Hongguo Drama',
    sourceUrl: 'https://www.hongguoduanju.com/',
    actors: ['Actor One', 'Actor Two'],
    ipName: 'Alpha Drama IP',
    categories: ['revenge', 'romance'],
    summary: 'A clean drama fixture for dataset tests.',
    metrics: {
      playOrReadYi: 10,
      platformHeatWan: 7445,
      searchIndex: 0,
      topicPlayYi: 3.2,
    },
    evidence: [{ label: 'Hongguo ranking sample', url: 'https://example.com/drama-rank' }],
    capturedAt: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

test('calculateCompositeScore combines play/read, platform heat, search index and topic score', () => {
  const score = calculateCompositeScore({
    playOrReadYi: 10,
    platformHeatWan: 7445,
    searchIndex: 0,
    topicPlayYi: 3.2,
  });

  assert.equal(score.playOrReadScore, 100);
  assert.equal(score.platformHeatScore, 95);
  assert.equal(score.searchIndexScore, 0);
  assert.equal(score.topicScore, 88);
  assert.equal(score.totalScore, 77.3);
});

test('calculateCompositeScore accepts social topic signal score when topic play count is unavailable', () => {
  const score = calculateCompositeScore({
    playOrReadYi: 0,
    platformHeatWan: 0,
    searchIndex: 0,
    topicSignalScore: 92,
  });

  assert.equal(score.topicScore, 92);
  assert.equal(score.totalScore, 9.2);
});

test('calculateCompositeScore derives platform heat from platform rank when heat value is unavailable', () => {
  const topRankScore = calculateCompositeScore({
    platformHotRank: 1,
  });
  const lowerRankScore = calculateCompositeScore({
    platformHotRank: 20,
  });

  assert.equal(topRankScore.platformHeatScore, 100);
  assert.equal(topRankScore.totalScore, 30);
  assert.ok(lowerRankScore.platformHeatScore < topRankScore.platformHeatScore);
  assert.ok(lowerRankScore.platformHeatScore > 0);
});

test('refreshHotDataset writes current, snapshot and searchable indexes from seed data', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-'));
  try {
    const result = await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeDramaSeed()],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    assert.equal(result.count, 1);
    assert.equal(result.list[0].title, 'Alpha Drama');
    assert.equal(result.list[0].source.provider, 'hongguo');
    assert.equal(result.list[0].heatMetric, 'playback');
    assert.ok(result.list[0].hotScore > 700000);

    const listed = await listHotDatasetContents({ type: 'drama', dataDir, keyword: 'Actor Two' });
    assert.equal(listed.pagination.total, 1);
    assert.equal(listed.list[0].ipName, 'Alpha Drama IP');

    const topic = await listHotDatasetTopicContents({ field: 'actor', value: 'Actor One', type: 'drama', dataDir });
    assert.equal(topic.pagination.total, 1);
    assert.equal(topic.list[0].title, 'Alpha Drama');

    const detail = await getHotDatasetContentById('drama:hongguo:alpha', { dataDir });
    assert.equal(detail.leaderboardEvidence[0].label, 'Hongguo ranking sample');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshHotDataset uses Beijing calendar date for current dataset and snapshot keys', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-date-'));
  try {
    const result = await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeDramaSeed()],
      now: new Date('2026-07-03T22:48:57.341Z'),
    });

    assert.equal(result.dataset.date, '2026-07-04');
    assert.equal(result.list[0].updatedAt, '2026-07-03T22:48:57.341Z');
    assert.equal(result.list[0].cachedAt, '2026-07-03T22:48:57.341Z');

    const snapshotText = await readFile(join(dataDir, 'snapshots', '2026-07-04', 'drama.json'), 'utf8');
    const snapshot = JSON.parse(snapshotText);
    assert.equal(snapshot.date, '2026-07-04');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshHotDataset exposes supplemental hot signals on detail and preview payloads', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-signals-'));
  try {
    await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeDramaSeed({
        id: 'drama:hongguo:signals',
        hotSignals: [
          { platform: 'baidu', platformName: 'Baidu Index', keyword: 'Alpha Drama', rank: 1, searchIndex: 9820 },
          { platform: 'weibo', platformName: 'Weibo Hot', keyword: 'Actor Two New Drama', rank: 2, topicSignalScore: 92 },
        ],
      })],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    const detail = await getHotDatasetContentById('drama:hongguo:signals', { dataDir });
    const preview = await getHotDatasetPreview({ type: 'drama', dataDir, limit: 3 });

    assert.deepEqual(detail.hotSignals.map(item => [item.platform, item.keyword, item.rank]), [
      ['baidu', 'Alpha Drama', 1],
      ['weibo', 'Actor Two New Drama', 2],
    ]);
    assert.deepEqual(preview.items[0].hotSignals.map(item => item.platform), ['baidu', 'weibo']);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('repository novel seeds provide 100 verifiable novel rows with reading metrics', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-novel-seed-'));
  try {
    const seedUrl = new URL('../../data/seeds/novel.json', import.meta.url);
    const seeds = JSON.parse(await readFile(seedUrl, 'utf8'));
    const result = await refreshHotDataset('novel', {
      dataDir,
      seeds,
      now: new Date('2026-06-23T08:00:00.000Z'),
    });

    assert.equal(result.count, 100);
    assert.ok(result.list.some(item => item.source.provider === 'qidian'));
    assert.ok(result.list.some(item => item.source.provider === 'baidu_novel'));
    assert.ok(result.list.every(item => item.heatMetric === 'reading'));
    assert.ok(result.list.every(item => item.author));
    assert.ok(result.list.every(item => item.tags.length > 0));
    assert.ok(result.list.every(item => item.leaderboardEvidence.length > 0));
    assert.ok(result.list.every(item => Number(item.metrics.playOrReadYi) > 0));
    assert.ok(result.list.every(item => Number(item.metrics.playOrReadScore) > 0));

    const firstAuthor = result.list.find(item => item.author)?.author;
    const authorTopic = await listHotDatasetTopicContents({
      field: 'author',
      value: firstAuthor,
      type: 'novel',
      dataDir,
    });
    assert.ok(authorTopic.pagination.total >= 1);

    const keyword = await listHotDatasetContents({ type: 'novel', dataDir, keyword: result.list[0].title });
    assert.equal(keyword.pagination.total, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('repository anime and comic seeds provide ranked list and detail payloads', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-four-module-seed-'));
  try {
    for (const type of ['anime', 'comic']) {
      const seedUrl = new URL('../../data/seeds/' + type + '.json', import.meta.url);
      const seeds = JSON.parse(await readFile(seedUrl, 'utf8'));
      const result = await refreshHotDataset(type, {
        dataDir,
        seeds,
        now: new Date('2026-06-26T08:00:00.000Z'),
      });

      assert.equal(result.count, 100);
      assert.equal(result.list.every(item => item.type === type), true);
      assert.equal(result.list.every(item => item.heatMetric === (type === 'anime' ? 'playback' : 'reading')), true);
      assert.ok(result.list.every(item => Number(item.metrics.playOrReadYi) > 0));
      assert.ok(result.list.every(item => item.leaderboardEvidence.length > 0));

      const sources = new Set(result.list.map(item => item.source.provider));
      if (type === 'anime') {
        assert.deepEqual(sources, new Set(['bilibili']));
        assert.ok(result.list.filter(item => item.characters.length > 0).length >= 90);
      } else {
        assert.deepEqual(sources, new Set(['tencent_comic']));
        assert.ok(result.list.every(item => item.author));
      }

      const listed = await listHotDatasetContents({ type, page: 1, limit: 5, dataDir });
      assert.equal(listed.list.length, 5);
      assert.equal(listed.list.every(item => item.type === type), true);

      const detail = await getHotDatasetContentById(result.list[0].id, { dataDir });
      assert.equal(detail.type, type);
      assert.ok(detail.leaderboardEvidence.length > 0);
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshHotDataset filters invalid items before ranking', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-'));
  try {
    const result = await refreshHotDataset('drama', {
      dataDir,
      seeds: [
        makeDramaSeed({
          id: 'drama:manual:broken',
          title: '',
          source: 'manual',
          sourceName: 'Manual',
          actors: [],
          categories: ['broken'],
          summary: 'This row should be removed.',
          metrics: { playOrReadYi: 1 },
        }),
        makeDramaSeed({
          id: 'drama:manual:clean',
          title: 'Clean Drama',
          source: 'hongguo',
          sourceName: 'Hongguo Drama',
          actors: ['Actor One'],
          categories: ['clean'],
          summary: 'This row should stay.',
          metrics: { playOrReadYi: 10, platformHeatWan: 7445, topicPlayYi: 3.2 },
        }),
      ],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    assert.equal(result.count, 1);
    assert.equal(result.list[0].id, 'drama:manual:clean');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshHotDataset materializes relation groups for IP actor and category links', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-relations-'));
  try {
    const result = await refreshHotDataset('drama', {
      dataDir,
      seeds: [
        makeDramaSeed({
          id: 'drama:hongguo:relation-a',
          title: 'Relation A',
          actors: ['Shared Actor'],
          ipName: 'Shared IP',
          categories: ['shared-category', 'romance'],
          metrics: { playOrReadYi: 10, platformHeatWan: 7445, topicPlayYi: 3.2 },
        }),
        makeDramaSeed({
          id: 'drama:hongguo:relation-b',
          title: 'Relation B',
          actors: ['Shared Actor'],
          ipName: 'Shared IP',
          categories: ['revenge'],
          metrics: { playOrReadYi: 8, platformHeatWan: 6400, topicPlayYi: 1.5 },
        }),
        makeDramaSeed({
          id: 'drama:hongguo:relation-c',
          title: 'Relation C',
          actors: ['Other Actor'],
          ipName: 'Other IP',
          categories: ['shared-category'],
          metrics: { playOrReadYi: 6, platformHeatWan: 5200, topicPlayYi: 0.8 },
        }),
      ],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    const topItem = result.dataset.items.find(item => item.id === 'drama:hongguo:relation-a');
    assert.ok(topItem.relations);
    assert.deepEqual(topItem.relations.sameIp.map(item => item.id), ['drama:hongguo:relation-b']);
    assert.deepEqual(topItem.relations.sameActors.map(item => item.id), ['drama:hongguo:relation-b']);
    assert.deepEqual(topItem.relations.sameCategories.map(item => item.id), ['drama:hongguo:relation-c']);

    const detail = await getHotDatasetContentById('drama:hongguo:relation-a', { dataDir });
    assert.deepEqual(detail.relations.sameIp.map(item => item.id), ['drama:hongguo:relation-b']);
    assert.deepEqual(detail.relations.sameActors.map(item => item.id), ['drama:hongguo:relation-b']);
    assert.deepEqual(detail.relations.sameCategories.map(item => item.id), ['drama:hongguo:relation-c']);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
test('detail payload includes cross-module related items from shared categories', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-cross-module-relations-'));
  try {
    await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeDramaSeed({
        id: 'drama:hongguo:cross-module-source',
        title: 'Cross Module Drama',
        categories: ['shared-universe', 'romance'],
        metrics: { playOrReadYi: 10, platformHeatWan: 7445, topicPlayYi: 3.2 },
      })],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });
    await refreshHotDataset('novel', {
      dataDir,
      seeds: [{
        id: 'novel:fanqie:cross-module-target',
        type: 'novel',
        title: 'Cross Module Novel',
        source: 'fanqie',
        sourceName: 'Fanqie Novel',
        author: 'Author One',
        ipName: 'Cross Module Novel IP',
        categories: ['shared-universe'],
        summary: 'A clean novel fixture for cross-module relation tests.',
        metrics: {
          playOrReadYi: 9,
          platformHeatWan: 6800,
          searchIndex: 1200,
          topicSignalScore: 80,
        },
        evidence: [{ label: 'Fanqie ranking sample', url: 'https://example.com/novel-rank' }],
      }],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    const detail = await getHotDatasetContentById('drama:hongguo:cross-module-source', { dataDir });
    assert.ok(detail.relatedContents.some(item => (
      item.id === 'novel:fanqie:cross-module-target'
      && item.type === 'novel'
    )));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});



test('buildDataset attaches ranking evidence and ranking meta', () => {
  const dataset = buildDataset('drama', [
    {
      id: 'drama:annual:001',
      type: 'drama',
      title: 'Annual Drama',
      categories: ['short-drama'],
      rankingEvidence: [
        { sourceId: 'annual-2026', sourceName: 'Annual Drama Board', sourceUrl: 'https://example.com/annual', rank: 1, evidenceType: 'annual_rank', confidence: 0.95 },
        { sourceId: 'hongguo', sourceName: 'Hongguo Hot Board', sourceUrl: 'https://example.com/hg', rank: 2, evidenceType: 'platform_rank', confidence: 0.82 },
      ],
      metrics: { authorityRankScore: 100, platformOriginalRank: 2, sourceConfidenceScore: 95 },
    },
  ], { now: new Date('2026-07-09T00:00:00.000Z') });

  assert.equal(dataset.items[0].rankingEvidence.length, 2);
  assert.equal(dataset.items[0].rankingMeta.authorityRank, 1);
  assert.equal(dataset.items[0].rankingMeta.bestPlatformRank, 2);
  assert.equal(dataset.items[0].rankingMeta.sourceConfidence, 'high');
  assert.match(dataset.items[0].rankingMeta.rankingReason, /Annual Drama Board/);
});

test('buildDataset sorts all modules by mixed ranking total score', () => {
  const dataset = buildDataset('novel', [
    { id: 'novel:low', type: 'novel', title: 'Low Score Novel', metrics: { platformOriginalRank: 25, sourceConfidenceScore: 60 } },
    { id: 'novel:high', type: 'novel', title: 'High Score Novel', metrics: { authorityRankScore: 98, platformOriginalRank: 3, sourceConfidenceScore: 90 } },
  ], { now: new Date('2026-07-09T00:00:00.000Z') });

  assert.equal(dataset.items[0].id, 'novel:high');
  assert.equal(dataset.items[0].rank, 1);
  assert.equal(dataset.items[1].rank, 2);
});


test('buildDataset gives authority original rank priority over composite score', () => {
  const dataset = buildDataset('drama', [
    { id: 'drama:annual:002', type: 'drama', title: 'Annual Two', metrics: { authorityOriginalRank: 2, authorityRankScore: 99, platformOriginalRank: 2, sourceConfidenceScore: 95 } },
    { id: 'drama:annual:001', type: 'drama', title: 'Annual One', metrics: { authorityOriginalRank: 1, authorityRankScore: 100, platformOriginalRank: 4, sourceConfidenceScore: 95 } },
    { id: 'drama:platform:001', type: 'drama', title: 'Platform One', metrics: { platformOriginalRank: 1, platformRankScore: 100, sourceConfidenceScore: 90 } },
  ], { now: new Date('2026-07-09T00:00:00.000Z') });

  assert.deepEqual(dataset.items.map(item => item.id), [
    'drama:annual:001',
    'drama:annual:002',
    'drama:platform:001',
  ]);
});
