import { fetchHotSignals, parseHotSignals } from './hotSignalParser.js';

const DOUYIN_HOT_SOURCE = {
  id: 'douyin',
  label: '抖音热点',
  url: 'https://www.douyin.com/hot',
};

function parseDouyinHotSignals({ html, now = new Date(), limit = 50 } = {}) {
  return parseHotSignals({
    html,
    platform: DOUYIN_HOT_SOURCE.id,
    platformName: DOUYIN_HOT_SOURCE.label,
    sourceUrl: DOUYIN_HOT_SOURCE.url,
    now,
    limit,
  });
}

async function fetchDouyinHotSignals(options = {}) {
  return fetchHotSignals({ ...options, source: DOUYIN_HOT_SOURCE });
}

export {
  DOUYIN_HOT_SOURCE,
  fetchDouyinHotSignals,
  parseDouyinHotSignals,
};
