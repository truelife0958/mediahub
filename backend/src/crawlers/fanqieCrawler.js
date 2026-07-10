import { parseTargetPlatformHtml } from '../services/targetPlatformCrawlerService.js';

const FANQIE_SOURCE = {
  id: 'fanqie',
  type: 'novel',
  label: '番茄小说',
  url: 'https://fanqienovel.com/',
};

function parseFanqieHotItems({ html, baseUrl = FANQIE_SOURCE.url, now = new Date() } = {}) {
  return parseTargetPlatformHtml({
    type: FANQIE_SOURCE.type,
    source: FANQIE_SOURCE.id,
    html,
    baseUrl,
    now,
  });
}

async function fetchFanqieHotItems({
  fetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  if (typeof fetchText !== 'function') {
    throw new TypeError('fetchText is required');
  }
  const html = await fetchText(FANQIE_SOURCE.url, { source: FANQIE_SOURCE, type: FANQIE_SOURCE.type, abortSignal });
  return parseFanqieHotItems({ html, baseUrl: FANQIE_SOURCE.url, now }).slice(0, limit);
}

export {
  FANQIE_SOURCE,
  fetchFanqieHotItems,
  parseFanqieHotItems,
};
