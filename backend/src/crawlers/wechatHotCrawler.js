import { fetchHotSignals, parseHotSignals } from './hotSignalParser.js';

const WECHAT_HOT_SOURCE = {
  id: 'wechat',
  label: '微信热点',
  url: 'https://weixin.sogou.com/',
};

function parseWechatHotSignals({ html, now = new Date(), limit = 50 } = {}) {
  return parseHotSignals({
    html,
    platform: WECHAT_HOT_SOURCE.id,
    platformName: WECHAT_HOT_SOURCE.label,
    sourceUrl: WECHAT_HOT_SOURCE.url,
    now,
    limit,
  });
}

async function fetchWechatHotSignals(options = {}) {
  return fetchHotSignals({ ...options, source: WECHAT_HOT_SOURCE });
}

export {
  WECHAT_HOT_SOURCE,
  fetchWechatHotSignals,
  parseWechatHotSignals,
};
