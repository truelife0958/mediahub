import { parseTargetPlatformHtml } from '../services/targetPlatformCrawlerService.js';

const QIDIAN_SOURCE = {
  id: 'qidian',
  type: 'novel',
  label: '起点中文网',
  url: 'https://www.qidian.com/rank/',
};

function parseQidianHotItems({ html, baseUrl = QIDIAN_SOURCE.url, now = new Date() } = {}) {
  return parseTargetPlatformHtml({
    type: QIDIAN_SOURCE.type,
    source: QIDIAN_SOURCE.id,
    html,
    baseUrl,
    now,
  });
}

async function fetchQidianHotItems({
  fetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  if (typeof fetchText !== 'function') {
    throw new TypeError('fetchText is required');
  }
  const html = await fetchText(QIDIAN_SOURCE.url, { source: QIDIAN_SOURCE, type: QIDIAN_SOURCE.type, abortSignal });
  return parseQidianHotItems({ html, baseUrl: QIDIAN_SOURCE.url, now }).slice(0, limit);
}

export {
  QIDIAN_SOURCE,
  fetchQidianHotItems,
  parseQidianHotItems,
};
