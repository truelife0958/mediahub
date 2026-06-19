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
    characters: toArray(item?.characters || item?.roles, 12),
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
  const searchTermHint = normalizedSearchTerms.length > 0 ? ` 扩展词:${normalizedSearchTerms.join('/')}` : '';
  const aliasHint = aliasHints ? ` 别名:${aliasHints}` : '';
  return [
    `输出${hint}热门清单，只返回JSON。`,
    `关键词:${keyword || '无'}${searchTermHint}${aliasHint} 爆款参考:${TYPE_SEARCH_ANCHORS[type] || hint} 数量:${limit} 排序:${sort} 页码:${page}`,
    '要求:只返回中国大陆原创内容;title用中文名且唯一;drama只返回微短剧不要长剧;每项含title,summary,tags,hotScore。',
    '{"items":[{"title":"","summary":"","tags":[],"hotScore":1000}]}'
  ].join('\n');
}

async function callAiSearch({ config, prompt, timeoutMs, abortSignal }) {
  // postAiChatCompletion throws on non-OK responses with publicCode,
  // so we only receive { response, payload } on success.
  const { payload } = await postAiChatCompletion({
    config,
    prompt,
    systemPrompt: '你是 MediaHub 的 AI 搜索助手。只返回可解析 JSON，不要 markdown，不要解释。',
    temperature: 0.2,
    timeoutMs,
    abortSignal,
  });

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
  timeoutMs,
  abortSignal,
} = {}) {
  const config = getAiConfigPrivate();
  if (!config?.enabled || !config?.apiKey) {
    throw createApiError('upstream_unavailable', 'AI 搜索未启用或缺少 API Key');
  }

  const prompt = buildPrompt({ type, keyword, searchTerms, aliasHints, page, limit, sort });
  const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const payload = await callAiSearch({ config, prompt, timeoutMs, abortSignal });

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
