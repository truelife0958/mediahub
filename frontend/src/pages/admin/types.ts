export type ContentType = 'drama' | 'novel' | 'comic' | 'anime';
export type ReferenceSection = 'prompt' | 'keywords' | 'rules' | 'aliases';

export interface AiFormState {
  enabled: boolean;
  model: string;
  baseUrl: string;
  apiKey: string;
  persistTarget: 'runtime' | 'env';
}

export const TYPE_OPTIONS: Array<{ id: ContentType; label: string }> = [
  { id: 'drama', label: '短剧' },
  { id: 'novel', label: '小说' },
  { id: 'comic', label: '漫画' },
  { id: 'anime', label: '动漫' },
];

export const TYPE_LABEL: Record<ContentType, string> = {
  drama: '短剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};
