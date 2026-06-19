import {
  listContents as listRemoteContents,
  getContentById as getRemoteContentById,
  discoverContents as discoverRemoteContents,
  listTopicContents as listRemoteTopicContents,
} from './catalogService.js';

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
  for (const type of ['drama', 'novel', 'comic', 'anime']) {
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
  const normalizedField = field === 'actor' || field === 'character' || field === 'author' || field === 'ip' ? field : 'ip';
  const normalizedValue = String(value || '').trim().slice(0, 80);
  const groups = {};
  for (const type of ['drama', 'novel', 'comic', 'anime']) {
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

export async function compareContents(ids = []) {
  const contents = [];
  for (const id of [...new Set(ids)].slice(0, 4)) {
    try {
      contents.push(await getRemoteContentById(id));
    } catch {
      // 对比页允许部分内容失效。
    }
  }
  return {
    ids,
    list: contents,
    metrics: contents.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      hotScore: item.hotScore,
      heatMetric: item.heatMetric,
      status: item.status,
      tagCount: item.tags?.length || 0,
      actorCount: item.actors?.length || 0,
    })),
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
