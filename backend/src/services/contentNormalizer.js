const DEFAULT_COVER = 'https://placehold.co/300x400/111827/ffffff?text=MediaHub';
const VALID_TYPES = new Set(['drama', 'novel', 'comic', 'anime']);
const VALID_STATUS = new Set(['ongoing', 'completed']);

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T00:00:00.000Z`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeStatus(input = '') {
  const value = String(input || '').toLowerCase();
  if (value.includes('running') || value.includes('publishing') || value.includes('airing') || value.includes('ongoing')) {
    return 'ongoing';
  }
  return VALID_STATUS.has(value) ? value : 'completed';
}

function normalizeStringArray(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item)).filter(Boolean))].slice(0, max);
}

function normalizeSource(source = {}) {
  const provider = cleanText(source.provider, 'unknown').toLowerCase();
  return {
    provider,
    label: cleanText(source.label, provider),
    url: cleanText(source.url),
  };
}

function normalizeContent(content) {
  const type = VALID_TYPES.has(content?.type) ? content.type : 'drama';
  const title = cleanText(content?.title, '未命名内容');

  return {
    id: cleanText(content?.id),
    title,
    cover: cleanText(content?.cover, DEFAULT_COVER),
    summary: cleanText(content?.summary, `${title}暂无简介`),
    type,
    tags: normalizeStringArray(content?.tags, 8),
    actors: normalizeStringArray(content?.actors, 8),
    author: cleanText(content?.author),
    ipName: cleanText(content?.ipName, title),
    status: normalizeStatus(content?.status),
    hotScore: Math.max(0, Math.round(Number(content?.hotScore) || 0)),
    createdAt: toIsoDate(content?.createdAt),
    updatedAt: toIsoDate(content?.updatedAt),
    source: normalizeSource(content?.source),
  };
}

export {
  DEFAULT_COVER,
  cleanText,
  normalizeStatus,
  toIsoDate,
  normalizeContent,
};
