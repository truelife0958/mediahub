import { createHash } from 'node:crypto';
import { createApiError } from '../utils/apiErrors.js';
import { DEFAULT_COVER, cleanText, normalizeContent } from './contentNormalizer.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { extractAiOutputText, postAiChatCompletion } from './aiChatClient.js';

const TYPE_HINT = {
  drama: '微短剧/短剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};

const TYPE_SEARCH_ANCHORS = {
  drama: '盛夏芬德拉、家里家外、无双、暗潮涌动',
  novel: '斗破苍穹、凡人修仙传、全职高手、诡秘之主',
  comic: '一人之下、狐妖小红娘、非人哉、镇魂街',
  anime: '凡人修仙传、斗罗大陆、遮天、灵笼',
};

const DRAMA_SHORT_CLUES = ['短剧', '微短剧', '微剧', '竖屏剧', '短视频剧'];
const DRAMA_LONG_CLUES = ['长剧', '电视剧', '网剧', '连续剧', '季播剧', '长篇剧'];

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseAiJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === 'object') return parsed;
  }

  return null;
}

function extractOutputText(payload) {
  return extractAiOutputText(payload);
}

function toArray(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item)).filter(Boolean))].slice(0, max);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function containsAnyClue(text, clues = []) {
  return clues.some(clue => text.includes(clue));
}

function isAllowedDramaItem(item) {
  const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
  const signal = cleanText([
    item?.title,
    item?.summary,
    item?.ipName,
    tags,
  ].join(' ')).toLowerCase();

  if (!signal) return true;
  const hasShortClue = containsAnyClue(signal, DRAMA_SHORT_CLUES);
  const hasLongClue = containsAnyClue(signal, DRAMA_LONG_CLUES);
  return hasShortClue || !hasLongClue;
}

function buildAiSourceId({ type, title, sourceUrl, index }) {
  const seed = `${type}|${String(title || '').toLowerCase()}|${String(sourceUrl || '').toLowerCase()}|${index}`;
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 16);
  return `${type}:ai-search:${hash}`;
}

function mapAiItemToContent({ type, item, index }) {
  const title = cleanText(item?.title, `${TYPE_HINT[type] || type} 热门内容 ${index + 1}`);
  const sourceUrl = cleanText(item?.sourceUrl || item?.url || item?.link || '');
  const hotScore = Math.max(0, Math.round(toNumber(item?.hotScore, 0)));

  return normalizeContent({
    id: buildAiSourceId({ type, title, sourceUrl, index }),
    title,
    cover: cleanText(item?.cover || item?.image || '', DEFAULT_COVER),
    summary: cleanText(item?.summary || item?.reason || `${title}暂无简介`),
    type,
    tags: toArray(item?.tags, 8),
    actors: toArray(item?.actors || item?.studios, 8),
    author: cleanText(item?.author || item?.publisher || 'AI Discovery'),
    ipName: cleanText(item?.ipName || item?.franchise || title),
    status: cleanText(item?.status || 'ongoing'),
    hotScore,
    createdAt: cleanText(item?.createdAt || item?.releaseDate || item?.publishedAt || ''),
    updatedAt: cleanText(item?.updatedAt || item?.lastUpdated || item?.releaseDate || ''),
    source: {
      provider: 'ai-search',
      label: 'AI Trending Search',
      region: 'CN',
      url: sourceUrl,
    },
  });
}

function buildPrompt({ type, keyword, searchTerms = [], aliasHints = '', page, limit, sort }) {
  const hint = TYPE_HINT[type] || type;
  const normalizedSearchTerms = [...new Set((Array.isArray(searchTerms) ? searchTerms : [])
    .map(item => cleanText(item))
    .filter(Boolean))]
    .slice(0, 8);
  const searchTermLine = normalizedSearchTerms.length > 0 ? normalizedSearchTerms.join(' / ') : '无';
  return [
    '请输出真实世界的热门内容清单，严格返回 JSON，不要 markdown。',
    `目标分类: ${hint}`,
    `关键词: ${keyword || '无'}`,
    `检索扩展词: ${searchTermLine}`,
    `别名参考: ${aliasHints || '无'}`,
    `真实爆款参考: ${TYPE_SEARCH_ANCHORS[type] || hint}`,
    `页码: ${page}`,
    `数量: ${limit}`,
    `排序偏好: ${sort}`,
    '要求:',
    '1) 必须返回 items 数组，长度 <= 数量。',
    '2) 只返回中国大陆公开发行或中国原创内容；不要返回欧美、日韩或其他海外作品。',
    '3) title 使用中文官方名称，必须唯一。',
    '4) drama 只返回微短剧/短剧，不要返回长剧、电视剧或网剧；其他分类按中国小说、国漫漫画、国产动漫处理。',
    '5) 每项字段: title, summary, tags[], actors[], author, ipName, status(ongoing/completed), hotScore, sourceUrl, cover, releaseDate。',
    '6) hotScore 使用全网播放量/阅读量的“万次”数值：短剧和动漫为播放量，小说和漫画为阅读量；未知时填 0，不要编造精确值。',
    '7) 演员、作者、制作方、上线年份、来源链接必须尽量真实准确，summary 简洁准确。',
    '8) sourceUrl 优先使用爱奇艺、腾讯视频、优酷、哔哩哔哩、起点中文网、腾讯动漫、央视网等中国公开页面。',
    '{"items":[{"title":"","summary":"","tags":[],"actors":[],"author":"","ipName":"","status":"ongoing","hotScore":1000,"sourceUrl":"","cover":"","releaseDate":"2025-01-01"}]}'
  ].join('\n');
}

async function callAiSearch({ config, prompt }) {
  const { response, payload } = await postAiChatCompletion({
    config,
    prompt,
    systemPrompt: '你是 MediaHub 的 AI 搜索助手。只返回可解析 JSON，不要 markdown，不要解释。',
    temperature: 0.2,
  });

  if (!response.ok) {
    const message = cleanText(payload?.error?.message || response.statusText || 'AI 搜索失败');
    throw createApiError('upstream_unavailable', `AI 搜索失败: ${message}`, {
      status: response.status,
    });
  }

  return payload;
}

async function searchTrendingContentsWithAi({
  type,
  keyword = '',
  searchTerms = [],
  aliasHints = '',
  page = 1,
  limit = 20,
  sort = 'hot',
} = {}) {
  const config = getAiConfigPrivate();
  if (!config?.enabled || !config?.apiKey) {
    throw createApiError('upstream_unavailable', 'AI 搜索未启用或缺少 API Key');
  }

  const prompt = buildPrompt({ type, keyword, searchTerms, aliasHints, page, limit, sort });
  const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const payload = await callAiSearch({ config, prompt });

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw createApiError('upstream_unavailable', 'AI 搜索未返回可解析结果');
  }

  const parsed = parseAiJson(outputText);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) {
    throw createApiError('upstream_unavailable', 'AI 搜索结果为空');
  }

  const dedupedByTitle = new Set();
  const list = [];
  for (const item of items) {
    if (list.length >= normalizedLimit) break;
    if (type === 'drama' && !isAllowedDramaItem(item)) continue;
    const titleKey = cleanText(item?.title).toLowerCase();
    if (!titleKey) continue;
    if (dedupedByTitle.has(titleKey)) continue;
    dedupedByTitle.add(titleKey);
    list.push(mapAiItemToContent({ type, item, index: list.length }));
  }

  if (list.length === 0) {
    throw createApiError('upstream_unavailable', 'AI 搜索结果无有效条目');
  }

  return {
    list,
    total: Math.max(list.length, Number(parsed?.total || parsed?.count || 0)),
  };
}

export { searchTrendingContentsWithAi };
