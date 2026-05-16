export type ContentType = 'drama' | 'novel' | 'comic' | 'anime';

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
