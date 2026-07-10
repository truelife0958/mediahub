import type { ContentType as SharedContentType } from '../../types';

export type ContentType = SharedContentType;

export const TYPE_OPTIONS: Array<{ id: ContentType; label: string }> = [
  { id: 'drama', label: '短剧' },
  { id: 'novel', label: '小说' },
  { id: 'anime', label: '动漫' },
  { id: 'comic', label: '漫画' },
];

export const TYPE_LABEL: Record<ContentType, string> = {
  drama: '短剧',
  novel: '小说',
  anime: '动漫',
  comic: '漫画',
};

export function getTypeLabel(type: string) {
  return TYPE_LABEL[type as ContentType] || type || '-';
}