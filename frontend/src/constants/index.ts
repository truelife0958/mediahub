export const VISIBLE_CONTENT_TYPES = ['drama', 'novel', 'anime', 'comic'] as const;
export type VisibleContentType = typeof VISIBLE_CONTENT_TYPES[number];

export const CATEGORY_TEXT: Record<VisibleContentType, string> = {
  drama: '短剧',
  novel: '小说',
  anime: '动漫',
  comic: '漫画',
};

export const CATEGORY_COLORS: Record<VisibleContentType, string> = {
  drama: 'var(--gradient-drama)',
  novel: 'var(--gradient-novel)',
  anime: 'var(--gradient-anime)',
  comic: 'var(--gradient-comic)',
};

export const CATEGORY_ICONS: Record<VisibleContentType, string> = {
  drama: '剧',
  novel: '文',
  anime: '动',
  comic: '漫',
};
