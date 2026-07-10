import type { Content, PublicReportField, PublicReportFieldSource } from '../types';

export const PUBLIC_FIELD_LABEL: Record<PublicReportField, string> = {
  releaseDate: '上线时间',
  playCount: '播放量',
  readCount: '阅读量',
  contentType: '类型',
  actors: '主演',
  copyrightOwner: '版权方',
  summary: '简介',
};

export function formatPublicSourceDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function getFieldSource(content: Content, field: PublicReportField) {
  return (content.fieldSources || []).find(item => item.field === field);
}

export function formatFieldSourceLine(source?: PublicReportFieldSource) {
  if (!source) return '来源：未找到公开报道';
  const date = formatPublicSourceDate(source.capturedAt);
  return `来源：${source.sourceName || '公开报道'}${date ? ` · 采集：${date}` : ''}`;
}

export function formatPublicFieldValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ');
  return String(value || '').trim();
}

export function buildPublicFactRows(content: Content) {
  const typeText = content.contentType || (content.tags || []).slice(0, 3).join(' / ');
  const actorsText = (content.actors || []).join(' / ');
  return [
    { field: 'releaseDate' as const, label: '上线时间', value: content.releaseDate || '' },
    { field: 'contentType' as const, label: '类型', value: typeText },
    { field: 'actors' as const, label: content.type === 'anime' ? '配音/角色' : '主演', value: actorsText },
    { field: 'copyrightOwner' as const, label: '版权方', value: content.copyrightOwner || '' },
  ].map(row => ({ ...row, source: getFieldSource(content, row.field) }));
}
