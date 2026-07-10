import { fetchHotSignals, parseHotSignals } from './hotSignalParser.js';

const WEIBO_HOT_SOURCE = {
  id: 'weibo',
  label: '微博热搜',
  url: 'https://s.weibo.com/top/summary?cate=realtimehot',
};

function parseWeiboHotSignals({ html, now = new Date(), limit = 50 } = {}) {
  return parseHotSignals({
    html,
    platform: WEIBO_HOT_SOURCE.id,
    platformName: WEIBO_HOT_SOURCE.label,
    sourceUrl: WEIBO_HOT_SOURCE.url,
    now,
    limit,
  });
}

async function fetchWeiboHotSignals(options = {}) {
  return fetchHotSignals({ ...options, source: WEIBO_HOT_SOURCE });
}

export {
  WEIBO_HOT_SOURCE,
  fetchWeiboHotSignals,
  parseWeiboHotSignals,
};
