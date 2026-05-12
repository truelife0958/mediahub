import { createApiError } from '../utils/apiErrors.js';
import { cleanText, normalizeContent } from './contentNormalizer.js';

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

async function enrichPublicContent({ title, text, type, sourceUrl, base = {} }) {
  const cleanedText = cleanText(text);
  if (cleanedText.length < 40) {
    throw createApiError('ai_extract_failed', '公开页面文本不足，无法完成 AI 结构化抽取', { sourceUrl });
  }

  return normalizeContent({
    ...base,
    id: base.id || `${type}:public:${encodeURIComponent(cleanText(title).slice(0, 80))}`,
    title: cleanText(title, base.title || '未命名内容'),
    summary: base.summary || buildSummary(cleanedText),
    type,
    tags: base.tags?.length ? base.tags : inferTags(cleanedText),
    actors: base.actors || [],
    author: base.author || 'Public Web',
    ipName: base.ipName || cleanText(title),
    status: base.status || 'completed',
    hotScore: base.hotScore || 100,
    source: {
      provider: 'public-web',
      label: 'Public Web',
      url: sourceUrl,
    },
  });
}

export { enrichPublicContent };
