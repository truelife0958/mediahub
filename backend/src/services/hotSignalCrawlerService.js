import {
  fetchBaiduHotSignals,
  fetchDouyinHotSignals,
  fetchWechatHotSignals,
  fetchWeiboHotSignals,
} from '../crawlers/index.js';

const HOT_SIGNAL_FETCHERS = [
  { platform: 'baidu', fetcher: fetchBaiduHotSignals },
  { platform: 'weibo', fetcher: fetchWeiboHotSignals },
  { platform: 'douyin', fetcher: fetchDouyinHotSignals },
  { platform: 'wechat', fetcher: fetchWechatHotSignals },
];

async function defaultFetchText(url, { abortSignal, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': process.env.UPSTREAM_USER_AGENT || 'Mozilla/5.0 MediaHubBot/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
    if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
  }
}

function normalizeSignalLoaderResult(result) {
  if (Array.isArray(result)) return { signals: result, errors: [] };
  return {
    signals: Array.isArray(result?.signals)
      ? result.signals
      : (Array.isArray(result?.list) ? result.list : []),
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };
}

async function fetchSupplementalHotSignals({
  fetchText = defaultFetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  const signals = [];
  const errors = [];

  for (const { platform, fetcher } of HOT_SIGNAL_FETCHERS) {
    try {
      const list = await fetcher({ fetchText, now, limit, abortSignal });
      signals.push(...list);
    } catch (error) {
      errors.push({
        platform,
        message: error?.message || 'fetch failed',
      });
    }
  }

  return {
    signals,
    errors,
    sources: HOT_SIGNAL_FETCHERS.map(item => item.platform),
  };
}

export {
  fetchSupplementalHotSignals,
  normalizeSignalLoaderResult,
};
