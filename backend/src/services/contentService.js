import {
  listContents as listRemoteContents,
  getContentById as getRemoteContentById,
  discoverContents as discoverRemoteContents,
  listTopicContents as listRemoteTopicContents,
} from './catalogService.js';
import { CONTENT_TYPES } from '../constants/contentTypes.js';

export async function listContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '', searchMode = 'hybrid' }) {
  return listRemoteContents({ type, page, limit, sort, keyword, searchMode });
}

export async function getContentById(id) {
  return getRemoteContentById(id);
}

export async function discoverContents(params) {
  return discoverRemoteContents(params);
}

export async function listTopicContents(params) {
  return listRemoteTopicContents(params);
}

export async function getIpUniverse(ipName) {
  const value = String(ipName || '').trim().slice(0, 80);
  if (!value) {
    const error = new Error('IP name is required');
    error.statusCode = 400;
    throw error;
  }
  const groups = {};
  for (const type of CONTENT_TYPES) {
    const data = await listRemoteTopicContents({ field: 'ip', value, type, limit: 20, sort: 'hot' });
    groups[type] = data.list || [];
  }
  const all = Object.values(groups).flat();
  return {
    ipName: value,
    total: all.length,
    groups,
    top: [...all].sort((a, b) => b.hotScore - a.hotScore).slice(0, 6),
  };
}

export async function getEntityProfile({ field, value }) {
  const normalizedField = ['actor', 'character', 'author', 'ip', 'category'].includes(field) ? field : 'ip';
  const normalizedValue = String(value || '').trim().slice(0, 80);
  const groups = {};
  for (const type of CONTENT_TYPES) {
    const data = await listRemoteTopicContents({ field: normalizedField, value: normalizedValue, type, limit: 20, sort: 'hot' });
    groups[type] = data.list || [];
  }
  const all = Object.values(groups).flat();
  const tags = new Map();
  for (const item of all) {
    for (const tag of item.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  return {
    field: normalizedField,
    value: normalizedValue,
    total: all.length,
    groups,
    top: [...all].sort((a, b) => b.hotScore - a.hotScore).slice(0, 8),
    tags: [...tags.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
  };
}

export function explainSearchMatch(content, keyword = '') {
  const term = String(keyword || '').trim().toLowerCase();
  if (!term || !content) return [];
  const checks = [
    ['标题', content.title],
    ['简介', content.summary],
    ['作者', content.author],
    ['IP', content.ipName],
    ['主演', ...(content.actors || [])],
    ['角色', ...(content.characters || [])],
    ['标签', ...(content.tags || [])],
  ];
  return checks
    .filter(([, ...values]) => values.some(value => String(value || '').toLowerCase().includes(term)))
    .map(([field]) => field);
}
