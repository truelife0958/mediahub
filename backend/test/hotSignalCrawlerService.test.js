import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBaiduHotSignals } from '../src/crawlers/baiduHotCrawler.js';
import { parseWeiboHotSignals } from '../src/crawlers/weiboHotCrawler.js';
import { parseDouyinHotSignals } from '../src/crawlers/douyinHotCrawler.js';
import { parseWechatHotSignals } from '../src/crawlers/wechatHotCrawler.js';
import { mergeHotSignalsIntoItems } from '../src/store/hotSignalMerger.js';

test('public hot signal parsers extract ranked platform signals without inventing metrics', () => {
  const now = new Date('2026-06-20T08:00:00.000Z');

  const baidu = parseBaiduHotSignals({
    html: '<div class="rank">1</div><a href="/s?wd=x">许你万丈光芒好</a><span>热搜指数 9820</span>',
    now,
  });
  const weibo = parseWeiboHotSignals({
    html: '<tr><td>2</td><td><a>余茵 新剧</a></td><td>热度 368000</td></tr>',
    now,
  });
  const douyin = parseDouyinHotSignals({
    html: '<li><span>3</span><a>许你万丈光芒好</a><em>话题播放 3.2亿</em></li>',
    now,
  });
  const wechat = parseWechatHotSignals({
    html: '<section><b>4</b><a>短剧复仇爽文改编</a><span>热度 86000</span></section>',
    now,
  });

  assert.deepEqual(baidu.map(item => [item.platform, item.keyword, item.rank, item.searchIndex]), [
    ['baidu', '许你万丈光芒好', 1, 9820],
  ]);
  assert.deepEqual(weibo.map(item => [item.platform, item.keyword, item.rank, item.heatValue]), [
    ['weibo', '余茵 新剧', 2, 368000],
  ]);
  assert.deepEqual(douyin.map(item => [item.platform, item.keyword, item.rank, item.topicPlayYi]), [
    ['douyin', '许你万丈光芒好', 3, 3.2],
  ]);
  assert.deepEqual(wechat.map(item => [item.platform, item.keyword, item.rank, item.heatValue]), [
    ['wechat', '短剧复仇爽文改编', 4, 86000],
  ]);
  assert.ok(!weibo[0].searchIndex);
  assert.ok(!wechat[0].topicPlayYi);
});

test('mergeHotSignalsIntoItems enriches matching works and leaves unmatched works unchanged', () => {
  const items = [
    {
      id: 'drama:hongguo:xuniwanzhang',
      type: 'drama',
      title: '许你万丈光芒好',
      source: 'hongguo',
      sourceName: '红果短剧',
      sourceUrl: 'https://www.hongguoduanju.com/',
      actors: ['马小宇', '余茵'],
      ipName: '许你万丈光芒好',
      categories: ['复仇', '甜宠'],
      metrics: {
        playOrReadYi: 10,
        platformHeatWan: 7445,
      },
      evidence: [],
    },
    {
      id: 'drama:hongguo:other',
      type: 'drama',
      title: '没有命中的作品',
      source: 'hongguo',
      sourceName: '红果短剧',
      actors: ['其他演员'],
      ipName: '没有命中的作品',
      categories: ['都市'],
      metrics: {
        playOrReadYi: 1,
        platformHeatWan: 120,
      },
      evidence: [],
    },
  ];

  const merged = mergeHotSignalsIntoItems(items, [
    { platform: 'baidu', platformName: '百度热搜', keyword: '许你万丈光芒好', rank: 1, searchIndex: 9820 },
    { platform: 'weibo', platformName: '微博热搜', keyword: '余茵 新剧', rank: 2, heatValue: 368000, topicSignalScore: 92 },
    { platform: 'douyin', platformName: '抖音热点', keyword: '许你万丈光芒好', rank: 3, topicPlayYi: 3.2 },
    { platform: 'wechat', platformName: '微信热点', keyword: '无关话题', rank: 4, heatValue: 86000, topicSignalScore: 60 },
  ]);

  assert.equal(merged[0].metrics.searchIndex, 9820);
  assert.equal(merged[0].metrics.topicPlayYi, 3.2);
  assert.equal(merged[0].metrics.topicSignalScore, 92);
  assert.ok(merged[0].metrics.totalScore > 0);
  assert.deepEqual(
    merged[0].hotSignals.map(item => item.platform),
    ['baidu', 'weibo', 'douyin']
  );
  assert.deepEqual(
    merged[0].evidence.map(item => item.label),
    ['百度热搜 #1', '微博热搜 #2', '抖音热点 #3']
  );

  assert.equal(merged[1].metrics.searchIndex, undefined);
  assert.equal(merged[1].metrics.topicPlayYi, undefined);
  assert.equal(merged[1].metrics.topicSignalScore, undefined);
  assert.deepEqual(merged[1].hotSignals, []);
  assert.deepEqual(merged[1].evidence, []);
});
