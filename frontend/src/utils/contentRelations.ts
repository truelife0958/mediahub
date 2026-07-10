import type { Content, ContentRelationRef } from '../types';
import { hasBrokenText } from './contentMetrics.ts';

type RelationSectionId = 'sameIp' | 'sameActors' | 'sameCategories';

export interface RelationDisplayItem extends ContentRelationRef {
  matchedText: string;
}

export interface RelationSection {
  id: RelationSectionId;
  title: string;
  description: string;
  items: RelationDisplayItem[];
}

const SECTION_COPY: Array<{
  id: RelationSectionId;
  title: string;
  description: string;
}> = [
  { id: 'sameIp', title: '同 IP', description: '同一 IP 或系列作品' },
  { id: 'sameActors', title: '同演员', description: '演员重合的热门作品' },
  { id: 'sameCategories', title: '同分类', description: '题材分类相近作品' },
];

function isDisplayableRelation(item: ContentRelationRef) {
  return Boolean(String(item?.id || '').trim())
    && Boolean(String(item?.title || '').trim())
    && !hasBrokenText(item.title)
    && !hasBrokenText(item.sourceName);
}

function toDisplayItem(item: ContentRelationRef): RelationDisplayItem {
  const matchedText = (item.matchedValues || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => !hasBrokenText(value))
    .join(' / ');

  return {
    ...item,
    matchedText,
  };
}

export function buildRelationSections(content?: Pick<Content, 'relations'> | null): RelationSection[] {
  if (!content?.relations) return [];

  return SECTION_COPY
    .map((section) => {
      const rawItems = section.id === 'sameCategories'
        ? (content.relations?.sameCategories || content.relations?.sameCategory || [])
        : (content.relations?.[section.id] || []);
      return {
        ...section,
        items: rawItems
        .filter(isDisplayableRelation)
        .slice(0, 6)
        .map(toDisplayItem),
      };
    })
    .filter(section => section.items.length > 0);
}
