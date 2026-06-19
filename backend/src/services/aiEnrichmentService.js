import { createApiError } from '../utils/apiErrors.js';
import { cleanText, normalizeContent } from './contentNormalizer.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { extractAiOutputText, postAiChatCompletion } from './aiChatClient.js';

const TAG_KEYWORDS = [
  '科幻', '动作', '冒险', '爱情', '悬疑', '奇幻', '历史', '喜剧', '犯罪', '青春',
  'anime', 'manga', 'fiction', 'drama', 'comedy', 'action', 'adventure', 'fantasy', 'mystery',
];

function inferTags(text) {
  const lower = text.toLowerCase();
  const tags = TAG_KEYWORDS.filter(tag => lower.includes(tag.toLowerCase()));
  return [...new Set(tags)].slice(0, 6);
}

function buildSummary(text) {
  const cleaned = cleanText(text);
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}...` : cleaned;
}

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
  if (fenced?.[1]) candidates.push(fenced[1].trim());

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

function buildAiPrompt({ title, text, type, sourceUrl }) {
  return [
    '请将以下内容文本结构化为 JSON，禁止输出 markdown。',
    `标题: ${title}`,
    `分类: ${type}`,
    `来源: ${sourceUrl}`,
    `正文: ${text.slice(0, 4000)}`,
    '输出 JSON 结构:',
    '{"summary":"","tags":[],"actors":[],"author":"","ipName":"","status":"ongoing|completed","hotScore":0}',
  ].join('\n');
}

async function extractStructuredWithAi({ title, text, type, sourceUrl }) {
  const config = getAiConfigPrivate();
  if (!config?.enabled || !config?.apiKey) return null;

  try {
    const { response, payload } = await postAiChatCompletion({
      config,
      prompt: buildAiPrompt({ title, text, type, sourceUrl }),
      systemPrompt: '你是 MediaHub 的内容结构化助手。只返回可解析 JSON，不要 markdown，不要解释。',
      temperature: 0.1,
      timeoutMs: 60_000,
    });
    if (!response.ok) return null;
    const outputText = extractAiOutputText(payload);
    if (!outputText) return null;

    return parseAiJson(outputText);
  } catch {
    return null;
  }
}

function heuristicExtract({ title, text, base = {} }) {
  return {
    summary: base.summary || buildSummary(text),
    tags: base.tags?.length ? base.tags : inferTags(text),
    actors: base.actors || [],
    author: base.author || 'Public Web',
    ipName: base.ipName || cleanText(title),
    status: base.status || 'completed',
    hotScore: base.hotScore || 100,
  };
}

async function enrichPublicContent({ title, text, type, sourceUrl, base = {} }) {
  const cleanedText = cleanText(text);
  if (cleanedText.length < 40) {
    throw createApiError('ai_extract_failed', '公开页面文本不足，无法完成 AI 结构化抽取', { sourceUrl });
  }

  const aiStructured = await extractStructuredWithAi({
    title,
    text: cleanedText,
    type,
    sourceUrl,
  });

  const derived = {
    ...heuristicExtract({ title, text: cleanedText, base }),
    ...(aiStructured && typeof aiStructured === 'object' ? aiStructured : {}),
  };

  return normalizeContent({
    ...base,
    id: base.id || `${type}:public:${encodeURIComponent(cleanText(title).slice(0, 80))}`,
    title: cleanText(title, base.title || '未命名内容'),
    summary: cleanText(derived.summary, buildSummary(cleanedText)),
    type,
    tags: Array.isArray(derived.tags) && derived.tags.length > 0 ? derived.tags : inferTags(cleanedText),
    actors: Array.isArray(derived.actors) ? derived.actors : (base.actors || []),
    author: cleanText(derived.author, base.author || 'Public Web'),
    ipName: cleanText(derived.ipName, base.ipName || cleanText(title)),
    status: derived.status || base.status || 'completed',
    hotScore: Number(derived.hotScore || base.hotScore || 100),
    source: {
      provider: base?.source?.provider || 'public-web',
      label: base?.source?.label || 'Public Web',
      url: sourceUrl,
    },
  });
}

export { enrichPublicContent };
