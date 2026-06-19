import { extractAiOutputText, postAiChatCompletion } from './aiChatClient.js';

function buildPrompt({ type, keyword, page, limit, sourceItems }) {
  const candidates = sourceItems.map(item => `${item.id} => ${item.title}`).join(' | ');
  return [
    '你是内容推荐编辑，请基于给定候选标题返回 JSON。',
    `分类: ${type}`,
    `关键词: ${keyword || '无'}`,
    `页码: ${page}`,
    `每页数量: ${limit}`,
    `候选列表: ${candidates}`,
    '输出要求:',
    '1) 只输出 JSON，不要 markdown。',
    '2) JSON 结构: {"items":[{"id":"...","reason":"...","score":0-100}]}。',
    '3) id 必须来自候选列表里的 id。',
  ].join('\n');
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
  if (!trimmed) return {};

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
    if (parsed) return parsed;
  }
  return {};
}

async function rankContentsWithAi(pool, config, { type, keyword = '', page = 1, limit = 20, timeoutMs, abortSignal } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return pool;
  if (!config?.enabled || !config?.apiKey) return pool;

  try {
    const prompt = buildPrompt({
      type,
      keyword,
      page,
      limit,
      sourceItems: pool.map(item => ({ id: item.id, title: item.title })),
    });

    const { payload } = await postAiChatCompletion({
      config,
      prompt,
      systemPrompt: '你是 MediaHub 的内容排序助手。只返回可解析 JSON，不要 markdown，不要解释。',
      temperature: 0.1,
      timeoutMs: timeoutMs || 30_000,
      abortSignal,
    });
    const outputText = extractAiOutputText(payload);
    if (!outputText) return pool;

    const parsed = parseAiJson(outputText);
    const rankItems = Array.isArray(parsed.items) ? parsed.items : [];
    if (rankItems.length === 0) return pool;

    const byId = new Map(pool.map(item => [item.id, item]));
    const ranked = rankItems
      .map((item) => {
        const base = byId.get(item.id);
        if (!base) return null;
        return {
          ...base,
          reason: item.reason || base.reason || 'AI 推荐',
          hotScore: typeof item.score === 'number'
            ? Math.max(base.hotScore, Math.round(item.score * 100))
            : base.hotScore,
        };
      })
      .filter(Boolean);

    if (ranked.length === 0) return pool;
    const rankedIds = new Set(ranked.map(item => item.id));
    const tail = pool.filter(item => !rankedIds.has(item.id));
    return [...ranked, ...tail];
  } catch {
    return pool;
  }
}

export { rankContentsWithAi };
