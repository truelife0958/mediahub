import type { Content } from '../../types';

function normalizeTags(tags: string[]) {
  return tags.map(item => item.trim()).filter(Boolean);
}

export function cloneContentDraft(content: Content | null) {
  if (!content) return null;
  return {
    ...content,
    tags: [...content.tags],
    actors: [...content.actors],
    source: content.source ? { ...content.source } : undefined,
    relatedContents: content.relatedContents ? [...content.relatedContents] : undefined,
    similarContents: content.similarContents ? [...content.similarContents] : undefined,
  };
}

export function parseEditorList(value: string) {
  return value.split(/[,\n，]/).map(item => item.trim()).filter(Boolean);
}

export function createContentEditorSignature(content: Content | null) {
  if (!content) return '';
  return JSON.stringify({
    title: content.title.trim(),
    summary: content.summary.trim(),
    status: content.status,
    author: content.author.trim(),
    hotScore: Number(content.hotScore) || 0,
    tags: normalizeTags(content.tags),
  });
}

export function hasContentEditorChanges(source: Content | null, draft: Content | null) {
  return createContentEditorSignature(source) !== createContentEditorSignature(draft);
}
