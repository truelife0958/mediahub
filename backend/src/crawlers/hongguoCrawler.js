import { parseTargetPlatformHtml } from '../services/targetPlatformCrawlerService.js';

const HONGGUO_SOURCE = {
  id: 'hongguo',
  type: 'drama',
  label: '红果短剧',
  url: 'https://www.hongguoduanju.com/',
};

function parseHongguoHotItems({ html, baseUrl = HONGGUO_SOURCE.url, now = new Date() } = {}) {
  return parseTargetPlatformHtml({
    type: HONGGUO_SOURCE.type,
    source: HONGGUO_SOURCE.id,
    html,
    baseUrl,
    now,
  });
}

async function fetchHongguoHotItems({
  fetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  if (typeof fetchText !== 'function') {
    throw new TypeError('fetchText is required');
  }
  const html = await fetchText(HONGGUO_SOURCE.url, { source: HONGGUO_SOURCE, type: HONGGUO_SOURCE.type, abortSignal });
  return parseHongguoHotItems({ html, baseUrl: HONGGUO_SOURCE.url, now }).slice(0, limit);
}

export {
  HONGGUO_SOURCE,
  fetchHongguoHotItems,
  parseHongguoHotItems,
};
