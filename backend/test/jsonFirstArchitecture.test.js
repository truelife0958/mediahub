import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { parseHongguoHotItems } from '../src/crawlers/hongguoCrawler.js';
import { parseFanqieHotItems } from '../src/crawlers/fanqieCrawler.js';
import { parseQidianHotItems } from '../src/crawlers/qidianCrawler.js';
import { runDailyUpdateJob } from '../src/jobs/dailyUpdateJob.js';
import { buildRelationsForItems } from '../src/store/relationBuilder.js';

test('JSON-first architecture has removed retired AI service modules', () => {
  const retiredFiles = [
    '../src/services/aiChatClient.js',
    '../src/services/aiConfigService.js',
    '../src/services/aiDiscoveryService.js',
    '../src/services/aiEnrichmentService.js',
    '../src/services/aiRankingService.js',
  ];

  for (const file of retiredFiles) {
    assert.equal(existsSync(new URL(file, import.meta.url)), false, file);
  }
});

test('JSON-first architecture has removed retired user and prompt workflow modules', () => {
  const retiredFiles = [
    '../src/routes/users.js',
    '../src/routes/recommendations.js',
    '../src/services/userService.js',
    '../src/services/recommendationService.js',
    '../src/services/referenceSettingsService.js',
    '../src/repositories/userRepository.js',
    '../src/repositories/aiConfigRepository.js',
    '../src/repositories/referenceSettingsRepository.js',
  ];

  for (const file of retiredFiles) {
    assert.equal(existsSync(new URL(file, import.meta.url)), false, file);
  }
});

test('runtime environment writer no longer accepts AI configuration keys', () => {
  const envFileSource = readFileSync(new URL('../src/utils/envFile.js', import.meta.url), 'utf8');

  assert.doesNotMatch(envFileSource, /MEDIAHUB_AI_/);
});

test('production data pipeline no longer carries retired source or module tokens', () => {
  const files = [
    '../src/repositories/sourceRepository.js',
    '../src/utils/ingestionCursor.js',
    '../src/services/catalogService.js',
    '../src/services/ingestionService.js',
    '../src/services/platformHotSourceService.js',
    '../src/services/targetPlatformCrawlerService.js',
    '../src/repositories/contentRepository.js',
    '../src/services/curatedRealContentService.js',
  ];

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /ai[_-]search/, `${file} should not reference retired ai-search source`);

    assert.doesNotMatch(source, /MEDIAHUB_BACKFILL_AI_TIMEOUT_MS/, `${file} should not keep retired AI timeout env alias`);
  }
});

test('target crawler modules expose source-specific parsers', () => {
  const now = new Date('2026-06-20T08:00:00.000Z');
  const hongguo = parseHongguoHotItems({
    html: '<a href="/detail/xn">许你万丈光芒好</a><span>真千金复仇 · 主演：马小宇、余茵 播放 10亿 热度 7445万</span>',
    now,
  });
  const fanqie = parseFanqieHotItems({
    html: '<a href="/page/1">我在精神病院学斩神</a><span>都市脑洞 · 作者：三九音域 · 阅读 12.5亿 · 热度 9800万</span>',
    now,
  });
  const qidian = parseQidianHotItems({
    html: '<a href="/book/1010868264/">诡秘之主</a><span>奇幻 · 作者：爱潜水的乌贼 · 阅读 10亿 · 月票 120万</span>',
    now,
  });

  assert.equal(hongguo[0].source, 'hongguo');
  assert.equal(hongguo[0].type, 'drama');
  assert.equal(fanqie[0].source, 'fanqie');
  assert.equal(fanqie[0].type, 'novel');
  assert.equal(qidian[0].source, 'qidian');
  assert.equal(qidian[0].type, 'novel');
});

test('relation builder creates IP actor and category links with singular category alias', () => {
  const items = buildRelationsForItems([
    {
      id: 'drama:hongguo:a',
      type: 'drama',
      title: '复仇千金一号',
      rank: 1,
      source: 'hongguo',
      sourceName: '红果短剧',
      ipName: '复仇千金',
      actors: ['演员甲'],
      categories: ['复仇'],
      metrics: { totalScore: 90 },
    },
    {
      id: 'drama:hongguo:b',
      type: 'drama',
      title: '复仇千金二号',
      rank: 2,
      source: 'hongguo',
      sourceName: '红果短剧',
      ipName: '复仇千金',
      actors: ['演员甲'],
      categories: ['甜宠'],
      metrics: { totalScore: 80 },
    },
    {
      id: 'drama:hongguo:c',
      type: 'drama',
      title: '分类相近三号',
      rank: 3,
      source: 'hongguo',
      sourceName: '红果短剧',
      ipName: '其他 IP',
      actors: ['演员乙'],
      categories: ['复仇'],
      metrics: { totalScore: 70 },
    },
  ]);

  assert.deepEqual(items[0].relations.sameIp.map(item => item.id), ['drama:hongguo:b']);
  assert.deepEqual(items[0].relations.sameActors.map(item => item.id), ['drama:hongguo:b']);
  assert.deepEqual(items[0].relations.sameCategories.map(item => item.id), ['drama:hongguo:c']);
  assert.deepEqual(items[0].relations.sameCategory.map(item => item.id), ['drama:hongguo:c']);
});

test('daily update job runs all requested types through the refresh pipeline', async () => {
  const calls = [];
  const results = await runDailyUpdateJob({
    types: ['drama', 'novel', 'anime', 'comic'],
    backfill: { pageCount: 1, pageSize: 20, sortModes: ['hot'] },
    logger: { error() {}, info() {} },
    refreshType: async (type, backfill) => {
      calls.push({ type, backfill });
      return { count: type === 'drama' ? 2 : 3 };
    },
  });

  assert.deepEqual(calls.map(item => item.type), ['drama', 'novel', 'anime', 'comic']);
  assert.deepEqual(calls[0].backfill, { pageCount: 1, pageSize: 20, sortModes: ['hot'] });
  assert.deepEqual(results.map(item => [item.type, item.status, item.count]), [
    ['drama', 'success', 2],
    ['novel', 'success', 3],
    ['anime', 'success', 3],
    ['comic', 'success', 3],
  ]);
});

test('production JSON hot pipeline uses store modules as canonical data and scoring layer', () => {
  const files = [
    '../src/store/jsonStore.js',
    '../src/store/scoreCalculator.js',
    '../src/store/hotSignalMerger.js',
    '../src/services/hotDatasetService.js',
    '../src/services/adminService.js',
    '../src/services/catalogService.js',
    '../src/services/ingestionService.js',
  ];

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /['"](?:\.\/jsonHotDataStore|\.\.\/services\/jsonHotDataStore)\.js['"]/, `${file} should not import the retired service JSON store`);
    assert.doesNotMatch(source, /['"](?:\.\/hotScoreCalculator|\.\.\/services\/hotScoreCalculator)\.js['"]/, `${file} should not import the retired service score calculator`);
  }
});

test('checked-in JSON hot data keeps ranking metrics relations and target sources', () => {
  const expectedSourcesByType = {
    drama: new Set(['baike_public', 'public_search', 'duanjubaike', 'iqiyi_public', 'chinesemov_public', 'hongguo_public']),
    novel: new Set(['qidian', 'baidu_novel']),
  };
  const requiredMetricKeys = [
    'playOrReadScore',
    'platformHeatScore',
    'searchIndexScore',
    'topicScore',
    'totalScore',
  ];
  const requiredRelationKeys = ['sameIp', 'sameActors', 'sameCategories', 'sameCategory'];

  for (const type of Object.keys(expectedSourcesByType)) {
    const dataset = JSON.parse(readFileSync(new URL(`../../data/current/${type}.json`, import.meta.url), 'utf8'));
    assert.equal(dataset.type, type);
    assert.match(dataset.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(dataset.items) && dataset.items.length > 0, `${type} should have checked-in hot items`);

    const sources = new Set();
    for (const item of dataset.items) {
      assert.equal(item.type, type);
      assert.ok(Number.isInteger(item.rank) && item.rank > 0, `${item.id} should have a positive rank`);
      assert.ok(item.id?.startsWith(`${type}:`), `${item.id} should be namespaced by type`);
      assert.ok(String(item.title || '').trim(), `${item.id} should have a title`);
      sources.add(item.source);

      for (const metricKey of requiredMetricKeys) {
        assert.ok(Number.isFinite(Number(item.metrics?.[metricKey])), `${item.id} missing numeric metric ${metricKey}`);
      }
      for (const relationKey of requiredRelationKeys) {
        assert.ok(Array.isArray(item.relations?.[relationKey]), `${item.id} missing relation list ${relationKey}`);
      }
    }

    assert.deepEqual(sources, expectedSourcesByType[type]);
  }
});

test('checked-in JSON hot data excludes navigation announcements and zero-signal crawler rows', () => {
  const bannedTitlePattern = /播放正片|番茄小说$|帮助中心|作家助手|公告|通知|数据刷量|短故事|分成收益/;

  for (const type of ['drama', 'novel', 'anime', 'comic']) {
    const dataset = JSON.parse(readFileSync(new URL(`../../data/current/${type}.json`, import.meta.url), 'utf8'));
    for (const item of dataset.items || []) {
      assert.doesNotMatch(item.title, bannedTitlePattern, `${item.id} should not be a site navigation or announcement row`);
      assert.ok(Number(item.metrics?.totalScore) > 0, `${item.id} should have a positive composite score`);
    }
  }
});

test('runtime scripts default to JSON-only storage for the data app', () => {
  const runnerSource = readFileSync(new URL('../../scripts/run-mediahub-command.mjs', import.meta.url), 'utf8');
  const entrySource = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const backendPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(runnerSource, /MEDIAHUB_DB_DISABLED:\s*process\.env\.MEDIAHUB_DB_DISABLED\s*\?\?\s*'true'/);
  assert.match(runnerSource, /MEDIAHUB_JSON_DATASET_ENABLED:\s*process\.env\.MEDIAHUB_JSON_DATASET_ENABLED\s*\?\?\s*'true'/);
  assert.match(runnerSource, /MEDIAHUB_AUTO_REFRESH_ENABLED:\s*process\.env\.MEDIAHUB_AUTO_REFRESH_ENABLED\s*\?\?\s*'true'/);
  assert.match(runnerSource, /MEDIAHUB_AUTO_REFRESH_ON_STARTUP:\s*process\.env\.MEDIAHUB_AUTO_REFRESH_ON_STARTUP\s*\?\?\s*'false'/);
  assert.match(runnerSource, /MEDIAHUB_AUTO_REFRESH_MODE:\s*process\.env\.MEDIAHUB_AUTO_REFRESH_MODE\s*\?\?\s*'daily'/);
  assert.match(entrySource, /isDatabaseDisabled\(\)/);
  assert.match(entrySource, /seedAllCuratedRealContents/);
  assert.doesNotMatch(backendPackage.scripts.dev, /nodemon|--watch/);
  assert.equal(backendPackage.scripts.dev, 'node src/index.js');
});

test('checked-in JSON hot data includes all four visible modules', () => {
  const dataRoot = new URL('../../data/current/', import.meta.url);
  const expectedNames = ['drama.json', 'novel.json', 'anime.json', 'comic.json'];
  const found = [];

  if (existsSync(dataRoot)) {
    for (const entry of readdirSync(dataRoot, { withFileTypes: true })) {
      if (entry.isFile() && expectedNames.includes(entry.name)) found.push(entry.name);
    }
  }

  assert.deepEqual(found.sort(), expectedNames.sort());
});
