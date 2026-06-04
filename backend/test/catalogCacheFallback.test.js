import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { listContents } from '../src/services/catalogService.js';
import { buildCuratedRealContents } from '../src/services/curatedRealContentService.js';

const cached = {
  id: 'anime:ai-search:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cover.jpg',
  summary: 'Cached real content.',
  type: 'anime',
  tags: ['Action'],
  actors: [],
  author: 'AI Discovery',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/1' },
};

test('listContents returns database content directly when cache exists', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({ type: 'anime', page: 1, limit: 10, __skipLiveFetchForTest: true });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, 'Cached Anime');
});

test('listContents returns empty list for keyword miss when cache already has this type', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({
    type: 'anime',
    keyword: 'naruto',
    page: 1,
    limit: 10,
    __skipLiveFetchForTest: true,
  });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 0);
  assert.equal(result.pagination.total, 0);
});

test('listContents returns empty list instead of upstream error when no cache exists', async () => {
  resetDatabaseForTest(':memory:');

  const result = await listContents({
    type: 'anime',
    page: 1,
    limit: 10,
    __skipLiveFetchForTest: true,
  });

  assert.equal(result.stale, false);
  assert.equal(result.list.length, 0);
  assert.equal(result.pagination.total, 0);
});

test('listContents seeds curated real contents when live AI is unavailable and cache is empty', async () => {
  resetDatabaseForTest(':memory:');
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_CURATED_REAL_SEED_ENABLED: process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'false';
  process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED = 'true';

  try {
    const result = await listContents({
      type: 'anime',
      page: 1,
      limit: 10,
    });

    assert.equal(result.stale, false);
    assert.ok(result.list.length >= 5);
    assert.equal(result.list[0].source.provider, 'curated-cn');
    assert.ok(result.list.every(item => item.source.provider === 'curated-cn'));
    assert.ok(result.list.every(item => !/[A-Za-z]{3,}/.test(item.title)));
    assert.ok(result.list.every(item => !/E2E|冒烟|回归样本|视觉基线|One Piece|Frieren|Dune|Sopranos/i.test(item.title)));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('curated drama seed uses China short dramas ranked by all-network views', async () => {
  resetDatabaseForTest(':memory:');
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_CURATED_REAL_SEED_ENABLED: process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'false';
  process.env.MEDIAHUB_CURATED_REAL_SEED_ENABLED = 'true';

  try {
    const result = await listContents({
      type: 'drama',
      page: 1,
      limit: 50,
    });

    const titles = result.list.map(item => item.title);
    assert.ok(titles.includes('盛夏芬德拉'));
    assert.ok(titles.includes('家里家外'));
    assert.ok(titles.includes('无双'));
    assert.equal(result.list[0].title, '十八岁太奶奶驾到，重整家族荣耀');
    assert.equal(result.list.find(item => item.title === '盛夏芬德拉')?.hotScore, 300_000);
    assert.equal(result.list.find(item => item.title === '暗潮涌动')?.hotScore, 0);
    assert.equal(result.list.find(item => item.title === '长路初心')?.hotScore, 0);
    assert.equal(result.list.find(item => item.title === '无双')?.hotScore, 0);
    assert.ok(result.list.every(item => item.source.provider === 'curated-cn'));
    assert.ok(result.list.every(item => item.tags.includes('短剧') || item.tags.includes('微短剧')));
    assert.ok(!titles.some(title => ['狂飙', '漫长的季节', '繁花', '庆余年 第二季'].includes(title)));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('curated China seeds use all-network playback or reading volume metrics', () => {
  const expectedVolumeByType = {
    novel: {
      '斗破苍穹': 1_000_000,
      '全职高手': 1_000_000,
      '凡人修仙传': 1_000_000,
      '诡秘之主': 10_000,
    },
    comic: {
      '一人之下': 3_000_000,
      '非人哉': 3_000_000,
      '狐妖小红娘': 1_660_000,
      '中国惊奇先生': 3_000_000,
      '镇魂街': 503_600,
    },
    anime: {
      '斗罗大陆': 5_380_000,
      '遮天': 17_000_000,
      '灵笼': 1_000_000,
      '凡人修仙传': 610_000,
    },
  };

  for (const [type, expectedByTitle] of Object.entries(expectedVolumeByType)) {
    const list = buildCuratedRealContents(type);
    const byTitle = new Map(list.map(item => [item.title, item]));
    for (const [title, expectedHotScore] of Object.entries(expectedByTitle)) {
      assert.equal(byTitle.get(title)?.hotScore, expectedHotScore, `${type}:${title}`);
      assert.equal(byTitle.get(title)?.source.region, 'CN', `${type}:${title}`);
    }
    assert.ok(list.every(item => item.hotScore === 0 || item.hotScore >= 10_000), `${type} should not use 9000-style heat placeholders`);
  }
});

test('curated drama seed keeps unverified short-drama volume as undisclosed', () => {
  const list = buildCuratedRealContents('drama');
  const byTitle = new Map(list.map(item => [item.title, item]));

  assert.equal(byTitle.get('盛夏芬德拉')?.hotScore, 300_000);
  assert.equal(byTitle.get('暗潮涌动')?.hotScore, 0);
  assert.equal(byTitle.get('长路初心')?.hotScore, 0);
  assert.equal(byTitle.get('无双')?.hotScore, 0);
  assert.match(byTitle.get('暗潮涌动')?.summary ?? '', /播放总量待平台披露/);
  assert.match(byTitle.get('长路初心')?.summary ?? '', /播放总量待平台披露/);
  assert.match(byTitle.get('无双')?.summary ?? '', /播放总量待平台披露/);
});

test('hybrid keyword search merges AI results into local cache and returns mapped heat metric', async () => {
  resetDatabaseForTest(':memory:');
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.ai/v1';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'true';

  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(String(options.body || '{}'));
    const prompt = body.messages?.map(message => message.content).join('\n');
    assert.match(prompt, /关键词: 盛夏芬德拉/);
    assert.match(prompt, /盛夏芬德拉、家里家外、无双、暗潮涌动/);
    assert.match(prompt, /drama 只返回微短剧\/短剧，不要返回长剧、电视剧或网剧/);
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  title: '盛夏芬德拉',
                  summary: '短剧热榜样本。',
                  tags: ['短剧'],
                  actors: ['刘萧旭'],
                  author: '马厩制片厂',
                  ipName: '盛夏芬德拉',
                  status: 'ongoing',
                  hotScore: 440000,
                  sourceUrl: 'https://example.com/drama/shengxia',
                },
              ],
            }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const first = await listContents({
      type: 'drama',
      keyword: '盛夏芬德拉',
      page: 1,
      limit: 10,
      sort: 'hot',
      searchMode: 'hybrid',
    });
    assert.ok(first.list.length >= 1);
    const aiItem = first.list.find(item => item.source?.provider === 'ai-search' && item.title === '盛夏芬德拉');
    assert.ok(aiItem);
    assert.equal(aiItem.hotScore, 440_000);
    assert.equal(aiItem.heatMetric, 'playback');

    global.fetch = async () => {
      throw new Error('upstream should not be called after cache upsert');
    };
    const second = await listContents({
      type: 'drama',
      keyword: '盛夏芬德拉',
      page: 1,
      limit: 10,
      sort: 'hot',
      searchMode: 'hybrid',
    });
    assert.ok(second.list.length >= 1);
    const cachedAiItem = second.list.find(item => item.source?.provider === 'ai-search' && item.title === '盛夏芬德拉');
    assert.ok(cachedAiItem);
    assert.equal(cachedAiItem.heatMetric, 'playback');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
