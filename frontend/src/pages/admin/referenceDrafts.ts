import type { ReferencePromptTemplate } from '../../types';

export function clonePromptTemplates(templates: ReferencePromptTemplate[]) {
  return templates.map(item => ({ ...item }));
}

export function cloneStringList(items: string[]) {
  return [...items];
}

export function serializePromptTemplates(templates: ReferencePromptTemplate[]) {
  return JSON.stringify(templates.map(item => ({
    version: item.version,
    name: item.name,
    status: item.status,
    prompt: item.prompt,
  })));
}

export function serializeStringList(items: string[]) {
  return JSON.stringify(items);
}
