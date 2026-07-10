import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchTargetPlatformHotItems,
  parseTargetPlatformHtml,
} from '../src/services/targetPlatformCrawlerService.js';

test('parseTargetPlatformHtml extracts Hongguo short-drama titles and filters generic TV news', () => {
  const html = `
    <div>红果短剧热播榜</div>
    <a href="/detail/xn">许你万丈光芒好</a>
    <span>真千金复仇 · 霸总甜宠 · 马小宇、余茵领衔主演</span>
    <span>站内热度峰值达7445万，点赞量超289万，收藏量达164万次，全网有效播放量破10亿，抖音相关话题播放超3.2亿</span>
    <a href="/news/friends">《老友记》《生活大爆炸》导演去世</a>
    <span>电视剧榜</span>
  `;

  const result = parseTargetPlatformHtml({
    type: 'drama',
    source: 'hongguo',
    html,
    baseUrl: 'https://www.hongguoduanju.com',
    now: new Date('2026-06-20T08:00:00.000Z'),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].title, '许你万丈光芒好');
  assert.equal(result[0].source, 'hongguo');
  assert.equal(result[0].sourceName, '红果短剧');
  assert.deepEqual(result[0].actors, ['马小宇', '余茵']);
  assert.ok(result[0].categories.includes('真千金复仇'));
  assert.ok(result[0].categories.includes('霸总甜宠'));
  assert.equal(result[0].metrics.playOrReadYi, 10);
  assert.equal(result[0].metrics.realPlayCount, 1_000_000_000);
  assert.equal(result[0].metrics.realMetricStatus, 'official');
  assert.equal(result[0].metrics.realMetricSources[0].sourceId, 'hongguo');
  assert.equal(result[0].metrics.platformHeatWan, 7445);
  assert.equal(result[0].metrics.likesWan, 289);
  assert.equal(result[0].metrics.favoritesWan, 164);
  assert.equal(result[0].metrics.topicPlayYi, 3.2);
  assert.ok(!result.some(item => item.title.includes('生活大爆炸')));
});

test('parseTargetPlatformHtml extracts Fanqie and Qidian novel rows', () => {
  const fanqie = parseTargetPlatformHtml({
    type: 'novel',
    source: 'fanqie',
    html: '<a href="/page/1">我在精神病院学斩神</a><span>都市脑洞 · 作者：三九音域 · 阅读 12.5亿 · 热度 9800万</span>',
    baseUrl: 'https://fanqienovel.com',
    now: new Date('2026-06-20T08:00:00.000Z'),
  });
  const qidian = parseTargetPlatformHtml({
    type: 'novel',
    source: 'qidian',
    html: '<a href="/book/1010868264/">诡秘之主</a><span>奇幻 · 作者：爱潜水的乌贼 · 阅读 10亿 · 月票 120万</span>',
    baseUrl: 'https://www.qidian.com',
    now: new Date('2026-06-20T08:00:00.000Z'),
  });

  assert.equal(fanqie.length, 1);
  assert.equal(fanqie[0].source, 'fanqie');
  assert.equal(fanqie[0].sourceName, '番茄小说');
  assert.equal(fanqie[0].title, '我在精神病院学斩神');
  assert.equal(fanqie[0].author, '三九音域');
  assert.ok(fanqie[0].categories.includes('都市脑洞'));
  assert.equal(fanqie[0].metrics.playOrReadYi, 12.5);
  assert.equal(fanqie[0].metrics.realReadCount, 1_250_000_000);
  assert.equal(fanqie[0].metrics.realMetricStatus, 'official');
  assert.equal(fanqie[0].metrics.platformHeatWan, 9800);

  assert.equal(qidian.length, 1);
  assert.equal(qidian[0].source, 'qidian');
  assert.equal(qidian[0].sourceName, '起点中文网');
  assert.equal(qidian[0].title, '诡秘之主');
  assert.equal(qidian[0].author, '爱潜水的乌贼');
  assert.ok(qidian[0].categories.includes('奇幻'));
  assert.equal(qidian[0].metrics.playOrReadYi, 10);
  assert.equal(qidian[0].metrics.realReadCount, 1_000_000_000);
  assert.equal(qidian[0].metrics.topicPlayYi, 1.2);
});

test('fetchTargetPlatformHotItems swallows platform failures and returns parsed items from available sources', async () => {
  const calls = [];
  const result = await fetchTargetPlatformHotItems({
    type: 'novel',
    fetchText: async (url) => {
      calls.push(url);
      if (url.includes('fanqienovel')) {
        return '<a href="/page/1">我在精神病院学斩神</a><span>作者：三九音域 阅读 12.5亿 热度 9800万</span>';
      }
      throw new Error('blocked');
    },
    now: new Date('2026-06-20T08:00:00.000Z'),
  });

  assert.ok(calls.some(url => url.includes('fanqienovel.com')));
  assert.ok(calls.some(url => url.includes('qidian.com')));
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].source, 'fanqie');
  assert.equal(result.errors.length, 1);
});

test('parseTargetPlatformHtml filters navigation announcement and zero-signal rows', () => {
  const now = new Date('2026-06-20T08:00:00.000Z');
  const drama = parseTargetPlatformHtml({
    type: 'drama',
    source: 'hongguo',
    html: `
      <a href="/detail/noise">播放正片</a><span>滑动查看更多短剧 热门短剧</span>
      <a href="/detail/valid">许你万丈光芒好</a><span>真千金复仇 · 主演：马小宇、余茵 · 播放 10亿 · 热度 7445万</span>
    `,
    baseUrl: 'https://www.hongguoduanju.com',
    now,
  });
  const novel = parseTargetPlatformHtml({
    type: 'novel',
    source: 'fanqie',
    html: `
      <a href="/">番茄小说</a><span></span>
      <a href="/writer/zone/help">帮助中心</a><span>作家助手 最新资讯</span>
      <a href="/notice/1">番茄小说关于治理作品阅读数据刷量行为的公告</a><span>公告</span>
      <a href="/page/1">我在精神病院学斩神</a><span>都市脑洞 · 作者：三九音域 · 阅读 12.5亿 · 热度 9800万</span>
    `,
    baseUrl: 'https://fanqienovel.com',
    now,
  });

  assert.deepEqual(drama.map(item => item.title), ['许你万丈光芒好']);
  assert.deepEqual(novel.map(item => item.title), ['我在精神病院学斩神']);
});
