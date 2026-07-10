const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (HTML_ENTITIES[normalized]) return HTML_ENTITIES[normalized];
    if (normalized.startsWith('#x')) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (normalized.startsWith('#')) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function stripTags(value) {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanKeyword(value) {
  return stripTags(value)
    .replace(/^[#\d\s.、-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHref(attrs = '') {
  const match = String(attrs).match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  return match?.[1] || match?.[2] || match?.[3] || '';
}

function resolveUrl(href, baseUrl) {
  try {
    return href ? new URL(href, baseUrl).toString() : String(baseUrl || '');
  } catch {
    return String(baseUrl || href || '');
  }
}

function isLikelyKeyword(keyword) {
  const value = String(keyword || '').trim();
  if (value.length < 2 || value.length > 60) return false;
  if (!/[\u4e00-\u9fffA-Za-z0-9]/.test(value)) return false;
  return !/^(更多|首页|登录|搜索|榜单|排行榜|展开)$/.test(value);
}

function extractAnchorCandidates(html, sourceUrl) {
  const text = String(html || '');
  const anchors = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(text))) {
    anchors.push({
      start: match.index,
      end: anchorRe.lastIndex,
      keyword: cleanKeyword(match[2]),
      sourceUrl: resolveUrl(extractHref(match[1]), sourceUrl),
    });
  }

  return anchors.map((anchor, index) => {
    const previousEnd = anchors[index - 1]?.end ?? Math.max(0, anchor.start - 160);
    const nextStart = anchors[index + 1]?.start ?? Math.min(text.length, anchor.end + 240);
    return {
      keyword: anchor.keyword,
      sourceUrl: anchor.sourceUrl,
      context: stripTags(text.slice(previousEnd, nextStart)),
    };
  });
}

function extractJsonCandidates(html, sourceUrl) {
  const candidates = [];
  const text = String(html || '');
  const objectRe = /\{[^{}]*(?:"(?:word|keyword|title|query|note)"\s*:\s*"[^"]+")[^{}]*\}/gi;
  let match;

  while ((match = objectRe.exec(text))) {
    const objectText = match[0];
    const keyword = objectText.match(/"(?:word|keyword|title|query|note)"\s*:\s*"([^"]+)"/i)?.[1] || '';
    if (!keyword) continue;
    candidates.push({
      keyword: cleanKeyword(keyword),
      sourceUrl,
      context: stripTags(objectText.replace(/[{}",:]/g, ' ')),
    });
  }

  return candidates;
}

function extractRank(context, keyword, fallback) {
  const text = String(context || '');
  const keywordIndex = text.indexOf(String(keyword || ''));
  const before = keywordIndex >= 0 ? text.slice(0, keywordIndex) : text;
  const beforeRanks = [...before.matchAll(/(?:^|\D)([1-9]\d{0,2})(?=\D|$)/g)]
    .map(match => Number(match[1]))
    .filter(rank => rank >= 1 && rank <= 100);
  if (beforeRanks.length > 0) return beforeRanks[beforeRanks.length - 1];

  const after = keywordIndex >= 0 ? text.slice(keywordIndex + String(keyword || '').length) : text;
  const afterRank = [...after.matchAll(/(?:排名|第|rank|热榜)\D{0,6}([1-9]\d{0,2})/gi)]
    .map(match => Number(match[1]))
    .find(rank => rank >= 1 && rank <= 100);
  return afterRank || fallback;
}

function parseNumberByLabels(context, labels) {
  const labelGroup = labels.join('|');
  const match = String(context || '').match(new RegExp(`(?:${labelGroup})[^0-9]{0,20}(\\d+(?:\\.\\d+)?)`, 'i'));
  return match ? Number(match[1]) : undefined;
}

function parseYiMetric(context, labels) {
  const labelGroup = labels.join('|');
  const match = String(context || '').match(new RegExp(`(?:${labelGroup})[^0-9]{0,20}(\\d+(?:\\.\\d+)?)\\s*(亿|万)?`, 'i'));
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  if (match[2] === '万') return Number((value / 10000).toFixed(4));
  return value;
}

function normalizeTopicSignalScore({ rank, heatValue }) {
  if (Number.isFinite(heatValue) && heatValue > 0) {
    return Math.max(1, Math.min(100, Math.round((Math.log10(heatValue + 1) / 6) * 100)));
  }
  if (Number.isFinite(rank) && rank > 0) {
    return Math.max(1, Math.min(100, Math.round(101 - rank)));
  }
  return undefined;
}

function buildSignal({ platform, platformName, sourceUrl, candidate, index, now }) {
  const rank = extractRank(candidate.context, candidate.keyword, index + 1);
  const heatValue = parseNumberByLabels(candidate.context, ['热度', '热值', '指数', 'heat']);
  const searchIndex = parseNumberByLabels(candidate.context, ['热搜指数', '搜索指数', '百度指数']);
  const topicPlayYi = parseYiMetric(candidate.context, ['话题播放', '相关话题播放', '抖音相关话题播放', '播放量']);
  const topicSignalScore = normalizeTopicSignalScore({ rank, heatValue });
  const signal = {
    platform,
    platformName,
    keyword: candidate.keyword,
    rank,
    sourceUrl: candidate.sourceUrl || sourceUrl || '',
    capturedAt: (now instanceof Date ? now : new Date(now || Date.now())).toISOString(),
  };

  if (Number.isFinite(heatValue)) signal.heatValue = heatValue;
  if (platform === 'baidu' && Number.isFinite(searchIndex)) signal.searchIndex = searchIndex;
  if (Number.isFinite(topicPlayYi)) signal.topicPlayYi = topicPlayYi;
  if (platform !== 'baidu' && Number.isFinite(topicSignalScore)) signal.topicSignalScore = topicSignalScore;

  return signal;
}

function parseHotSignals({
  html,
  platform,
  platformName,
  sourceUrl = '',
  now = new Date(),
  limit = 50,
} = {}) {
  const candidates = [
    ...extractAnchorCandidates(html, sourceUrl),
    ...extractJsonCandidates(html, sourceUrl),
  ];
  const seen = new Set();
  const signals = [];

  for (const candidate of candidates) {
    const keyword = cleanKeyword(candidate.keyword);
    if (!isLikelyKeyword(keyword)) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push(buildSignal({
      platform,
      platformName,
      sourceUrl,
      candidate: { ...candidate, keyword },
      index: signals.length,
      now,
    }));
  }

  return signals.slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));
}

async function fetchHotSignals({
  source,
  fetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  if (!source?.url) throw new TypeError('source.url is required');
  if (typeof fetchText !== 'function') throw new TypeError('fetchText is required');
  const html = await fetchText(source.url, { source, abortSignal });
  return parseHotSignals({
    html,
    platform: source.id,
    platformName: source.label,
    sourceUrl: source.url,
    now,
    limit,
  });
}

export {
  fetchHotSignals,
  parseHotSignals,
};
