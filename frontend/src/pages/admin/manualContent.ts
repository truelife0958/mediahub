import type { ContentType } from './types';

export interface ManualContentDraft {
  type: ContentType;
  title: string;
  summary: string;
  tags: string;
  actors: string;
  author: string;
  ipName: string;
  status: 'ongoing' | 'completed';
  hotScore: string;
  sourceUrl: string;
}

export function createManualDraft(type: ContentType): ManualContentDraft {
  return {
    type,
    title: '',
    summary: '',
    tags: '',
    actors: '',
    author: '',
    ipName: '',
    status: 'ongoing',
    hotScore: '0',
    sourceUrl: '',
  };
}
