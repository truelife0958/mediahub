import { createHash } from 'node:crypto';
import { createApiError } from '../utils/apiErrors.js';
import { DEFAULT_COVER, cleanText, normalizeContent } from './contentNormalizer.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { extractAiOutputText, postAiChatCompletion } from './aiChatClient.js';

const TYPE_HINT = {
  drama: '短剧/电视剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};

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

function buildAiSourceId({ type, title, sourceUrl, index }) {
  const seed = `${type}|${String(title || '').toLowerCase()}|${String(sourceUrl || '').toLowerCase()}|${index}`;
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 16);
  return `${type}:ai-search:${hash}`;
}

function mapAiItemToContent({ type, item, index }) {
  const title = cleanText(item?.title, `${TYPE_HINT[type] || type} 热门内容 ${index + 1}`);
  const sourceUrl = cleanText(item?.sourceUrl || item?.url || item?.link || '');
  const hotScore = Math.max(1, Math.round(toNumber(item?.hotScore, 1000)));

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
      url: sourceUrl,
    },
  });
}

function buildPrompt({ type, keyword, page, limit, sort }) {
  const hint = TYPE_HINT[type] || type;
  return [
    '请输出真实世界的热门内容清单，严格返回 JSON，不要 markdown。',
    `目标分类: ${hint}`,
    `关键词: ${keyword || '无'}`,
    `页码: ${page}`,
    `数量: ${limit}`,
    `排序偏好: ${sort}`,
    '要求:',
    '1) 必须返回 items 数组，长度 <= 数量。',
    '2) 每项字段: title, summary, tags[], actors[], author, ipName, status(ongoing/completed), hotScore(1-10000), sourceUrl, cover, releaseDate。',
    '3) title 必须唯一，summary 简洁准确。',
    '4) sourceUrl 尽量给出可公开访问的页面链接。',
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
  page = 1,
  limit = 20,
  sort = 'hot',
} = {}) {
  const config = getAiConfigPrivate();
  if (!config?.enabled || !config?.apiKey) {
    throw createApiError('upstream_unavailable', 'AI 搜索未启用或缺少 API Key');
  }

  const prompt = buildPrompt({ type, keyword, page, limit, sort });
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
    const titleKey = cleanText(item?.title).toLowerCase();
    if (!titleKey || dedupedByTitle.has(titleKey)) continue;
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
