import { fetchHotSignals, parseHotSignals } from './hotSignalParser.js';

const BAIDU_HOT_SOURCE = {
  id: 'baidu',
  label: '百度热搜',
  url: 'https://top.baidu.com/board?tab=realtime',
};

function parseBaiduHotSignals({ html, now = new Date(), limit = 50 } = {}) {
  return parseHotSignals({
    html,
    platform: BAIDU_HOT_SOURCE.id,
    platformName: BAIDU_HOT_SOURCE.label,
    sourceUrl: BAIDU_HOT_SOURCE.url,
    now,
    limit,
  });
}

async function fetchBaiduHotSignals(options = {}) {
  return fetchHotSignals({ ...options, source: BAIDU_HOT_SOURCE });
}

export {
  BAIDU_HOT_SOURCE,
  fetchBaiduHotSignals,
  parseBaiduHotSignals,
};
