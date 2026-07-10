import { createHash } from 'node:crypto';
import {
  extractRealMetricSourcesFromText,
  selectRealMetricPatch,
} from './realMetricCollectorService.js';
import {
  extractPublicReportFieldsFromText,
  selectPublicReportFieldPatch,
} from './publicReportFieldCollectorService.js';

const TARGET_SOURCES_BY_TYPE = {
  drama: [
    {
      id: 'hongguo',
      label: '红果短剧',
      url: 'https://www.hongguoduanju.com/',
    },
  ],
  novel: [
    {
      id: 'fanqie',
      label: '番茄小说',
      url: 'https://fanqienovel.com/',
    },
    {
      id: 'qidian',
      label: '起点中文网',
      url: 'https://www.qidian.com/rank/',
    },
  ],
};

const TYPE_DEFAULT_CATEGORY = {
  drama: '短剧',
  novel: '小说',
};

const DRAMA_NOISE_TERMS = [
  '电视剧榜',
  '老友记',
  '生活大爆炸',
  '导演去世',
  '新闻',
  '热搜',
  '榜单',
  '更多',
  '首页',
  '登录',
];

const COMMON_NOISE_TITLE_RE = /^(更多|首页|登录|搜索|分类|排行榜|热播榜|热门榜|点击查看|播放正片|继续播放|立即播放|滑动查看更多|热门短剧)$/;
const NOVEL_NOISE_TITLE_RE = /^(番茄小说|起点中文网|作家助手|帮助中心|最新资讯|原创风云榜|月票榜|推荐票榜|签约须知)$/;
const NOVEL_ANNOUNCEMENT_RE = /(公告|通知|帮助中心|作家助手|创作指南|侵权治理|数据刷量|低质短故事|签约作品|分成收益)/;

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function sha1(value) {
  return createHash('sha1').update(String(value || '')).digest('hex');
}

function getTargetSources(type) {
  return TARGET_SOURCES_BY_TYPE[type] || [];
}

function getSourceConfig(type, source) {
  const config = getTargetSources(type).find(item => item.id === source);
  return config || { id: source, label: source || '综合榜', url: '' };
}

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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(value) {
  return stripTags(value)
    .replace(/^《(.+)》$/, '$1')
    .replace(/^[#\d\s.、\-]+/, '')
    .replace(/[|｜].*$/, '')
    .replace(/\s+/g, '')
    .trim();
}

function isLikelyTitle(title, type) {
  const value = String(title || '').trim();
  if (value.length < 2 || value.length > 40) return false;
  if (!/[\u4e00-\u9fff]/.test(value)) return false;
  if (COMMON_NOISE_TITLE_RE.test(value)) return false;
  if (type === 'drama' && DRAMA_NOISE_TERMS.some(term => value.includes(term))) return false;
  if (type === 'novel' && (NOVEL_NOISE_TITLE_RE.test(value) || NOVEL_ANNOUNCEMENT_RE.test(value))) return false;
  return true;
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

function extractAnchorCandidates(html, baseUrl) {
  const anchors = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html || '')))) {
    anchors.push({
      start: match.index,
      end: anchorRe.lastIndex,
      title: cleanTitle(match[2]),
      href: extractHref(match[1]),
    });
  }

  return anchors.map((anchor, index) => {
    const nextStart = anchors[index + 1]?.start ?? Math.min(String(html || '').length, anchor.end + 1000);
    const contextHtml = String(html || '').slice(anchor.start, nextStart);
    return {
      title: anchor.title,
      itemUrl: resolveUrl(anchor.href, baseUrl),
      context: stripTags(contextHtml),
    };
  });
}

function extractBracketCandidates(html, baseUrl) {
  const text = stripTags(html);
  const candidates = [];
  const titleRe = /《([^》]{2,40})》/g;
  let match;
  while ((match = titleRe.exec(text))) {
    const title = cleanTitle(match[1]);
    const start = Math.max(0, match.index - 120);
    const end = Math.min(text.length, match.index + 500);
    candidates.push({
      title,
      itemUrl: String(baseUrl || ''),
      context: text.slice(start, end),
    });
  }
  return candidates;
}

function parseMetricByYi(text, labels) {
  const labelGroup = labels.join('|');
  const match = String(text || '').match(new RegExp(`(?:${labelGroup})[^0-9]{0,20}(\\d+(?:\\.\\d+)?)\\s*亿`));
  return match ? Number(match[1]) : undefined;
}

function parseMetricByWan(text, labels) {
  const labelGroup = labels.join('|');
  const match = String(text || '').match(new RegExp(`(?:${labelGroup})[^0-9]{0,20}(\\d+(?:\\.\\d+)?)\\s*万`));
  return match ? Number(match[1]) : undefined;
}

function pickNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function extractMetrics(context) {
  const text = cleanText(context);
  const metrics = {};

  const playOrReadYi = parseMetricByYi(text, ['全网有效播放量', '播放量', '阅读量', '播放', '观看', '阅读']);
  const platformHeatWan = parseMetricByWan(text, ['站内热度峰值', '热度峰值', '平台热度', '热度']);
  const likesWan = parseMetricByWan(text, ['点赞量', '点赞']);
  const favoritesWan = parseMetricByWan(text, ['收藏量', '收藏']);
  const searchIndex = String(text).match(/(?:热搜指数|搜索指数|百度指数)[^0-9]{0,20}(\d+(?:\.\d+)?)/);
  const topicPlayYi = parseMetricByYi(text, ['抖音相关话题播放', '话题播放', '话题度', '话题热度']);
  const monthlyVotesWan = parseMetricByWan(text, ['月票']);

  if (pickNumber(playOrReadYi) !== undefined) metrics.playOrReadYi = playOrReadYi;
  if (pickNumber(platformHeatWan) !== undefined) metrics.platformHeatWan = platformHeatWan;
  if (pickNumber(likesWan) !== undefined) metrics.likesWan = likesWan;
  if (pickNumber(favoritesWan) !== undefined) metrics.favoritesWan = favoritesWan;
  if (searchIndex) metrics.searchIndex = Number(searchIndex[1]);
  if (pickNumber(topicPlayYi) !== undefined) metrics.topicPlayYi = topicPlayYi;
  else if (pickNumber(monthlyVotesWan) !== undefined) metrics.topicPlayYi = Number((monthlyVotesWan / 100).toFixed(2));

  return metrics;
}

function splitNames(value) {
  return String(value || '')
    .split(/[、,，/]/)
    .map(item => item.replace(/(?:主演|作者|领衔主演|联合主演)[:：]/g, '').trim())
    .filter(Boolean)
    .filter(item => !/(热度|点赞|收藏|播放|阅读|月票|亿|万)/.test(item))
    .slice(0, 8);
}

function extractActors(context) {
  const text = cleanText(context);
  const labelFirst = text.match(/(?:主演|领衔主演)[:：]\s*([^。；;\n]+?)(?=\s*(?:热度|点赞|收藏|播放|阅读|抖音|微博|百度|微信|$))/);
  if (labelFirst) return splitNames(labelFirst[1]);

  const namesFirst = text.match(/([^。；;\n]{2,60}?)(?:领衔主演|联合主演|主演)/);
  if (!namesFirst) return [];
  const likelyNames = namesFirst[1].split(/[·|｜]/).pop();
  return splitNames(likelyNames);
}

function extractAuthor(context) {
  const match = String(context || '').match(/作者[:：]\s*([^·|｜,，、\s。；;]+)/);
  return match ? match[1].trim() : '';
}

function isUsefulCategory(value) {
  const item = String(value || '').trim();
  if (!item || item.length > 12) return false;
  if (/^(作者|主演|热度|点赞|收藏|播放|阅读|月票|全网|站内|抖音|微博|百度|微信)/.test(item)) return false;
  if (/(亿|万|\d|第.+名|榜|更多|首页|登录|搜索)/.test(item)) return false;
  return /[\u4e00-\u9fff]/.test(item);
}

function extractCategories(context, type, title = '') {
  const parts = String(context || '')
    .replace(String(title || ''), ' ')
    .replace(/[：:]/g, '：')
    .split(/[·|｜/]/)
    .map(item => item.trim())
    .filter(isUsefulCategory);
  const unique = [...new Set(parts)].slice(0, 8);
  if (unique.length > 0) return unique;
  return TYPE_DEFAULT_CATEGORY[type] ? [TYPE_DEFAULT_CATEGORY[type]] : [];
}

function buildSummary(context, title) {
  const summary = cleanText(context)
    .replace(title, '')
    .replace(/\s+/g, ' ')
    .trim();
  return summary.slice(0, 180);
}

function buildTargetItem({ type, sourceConfig, title, context, itemUrl, now }) {
  const capturedAt = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  const metrics = extractMetrics(context);
  const metricType = type === 'novel' || type === 'comic' ? 'read' : 'play';
  const realMetricSources = extractRealMetricSourcesFromText({
    text: context,
    metricType,
    sourceId: sourceConfig.id,
    sourceName: sourceConfig.label,
    sourceUrl: itemUrl || sourceConfig.url,
    capturedAt,
    confidence: 'official',
    method: 'public_page',
  });
  Object.assign(metrics, selectRealMetricPatch(realMetricSources, metricType));
  const publicFieldSources = extractPublicReportFieldsFromText({
    text: context,
    sourceId: sourceConfig.id,
    sourceName: sourceConfig.label,
    sourceUrl: itemUrl || sourceConfig.url,
    sourceType: 'platform_public',
    capturedAt,
  });
  const publicFieldPatch = selectPublicReportFieldPatch(publicFieldSources, { type, metrics });
  return {
    id: `${type}:${sourceConfig.id}:${sha1(`${type}|${sourceConfig.id}|${title}`).slice(0, 14)}`,
    type,
    title,
    source: sourceConfig.id,
    sourceName: sourceConfig.label,
    sourceUrl: itemUrl || sourceConfig.url,
    actors: extractActors(context),
    author: extractAuthor(context),
    ipName: title,
    categories: extractCategories(context, type, title),
    summary: publicFieldPatch.summary || buildSummary(context, title),
    status: 'ongoing',
    releaseDate: publicFieldPatch.releaseDate || '',
    contentType: publicFieldPatch.contentType || '',
    copyrightOwner: publicFieldPatch.copyrightOwner || '',
    fieldSources: publicFieldPatch.fieldSources || [],
    metrics: publicFieldPatch.metrics || metrics,
    evidence: [
      {
        label: `${sourceConfig.label}公开页面`,
        url: itemUrl || sourceConfig.url,
      },
    ],
    capturedAt,
  };
}

function hasHotSignal(item) {
  const metrics = item?.metrics || {};
  return [
    metrics.playOrReadYi,
    metrics.platformHeatWan,
    metrics.searchIndex,
    metrics.topicPlayYi,
    metrics.likesWan,
    metrics.favoritesWan,
  ].some(value => Number(value) > 0);
}

function parseTargetPlatformHtml({
  type,
  source,
  html,
  baseUrl,
  now = new Date(),
} = {}) {
  const sourceConfig = getSourceConfig(type, source);
  const seen = new Set();
  const items = [];
  const candidates = [
    ...extractAnchorCandidates(html, baseUrl || sourceConfig.url),
    ...extractBracketCandidates(html, baseUrl || sourceConfig.url),
  ];

  for (const candidate of candidates) {
    const title = cleanTitle(candidate.title);
    if (!isLikelyTitle(title, type)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    const item = buildTargetItem({
      type,
      sourceConfig,
      title,
      context: candidate.context,
      itemUrl: candidate.itemUrl,
      now,
    });
    if (!hasHotSignal(item)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}

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

async function fetchTargetPlatformHotItems({
  type,
  fetchText = defaultFetchText,
  now = new Date(),
  limit = 50,
  abortSignal,
} = {}) {
  const sources = getTargetSources(type);
  const list = [];
  const errors = [];

  for (const sourceConfig of sources) {
    try {
      const html = await fetchText(sourceConfig.url, { source: sourceConfig, type, abortSignal });
      const parsed = parseTargetPlatformHtml({
        type,
        source: sourceConfig.id,
        html,
        baseUrl: sourceConfig.url,
        now,
      });
      list.push(...parsed);
    } catch (error) {
      errors.push({
        source: sourceConfig.id,
        sourceName: sourceConfig.label,
        message: error?.message || 'fetch failed',
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  const effectiveLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  return {
    list: unique.slice(0, effectiveLimit),
    total: unique.length,
    errors,
    sources: sources.map(item => ({ id: item.id, label: item.label, url: item.url })),
  };
}

export {
  fetchTargetPlatformHotItems,
  getTargetSources,
  parseTargetPlatformHtml,
};
