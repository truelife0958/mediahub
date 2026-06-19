import { getUserById, listWatchHistory } from '../repositories/userRepository.js';
import { listCachedContents } from '../repositories/contentRepository.js';
import { refreshContentType } from './ingestionService.js';

function uniqueById(list = []) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function scoreByProfile(content, profile) {
  let boost = 0;
  let reason = '近期热门';

  const actorMatch = profile.actors.find(actor => content.actors?.includes(actor));
  if (actorMatch) {
    boost += 4500;
    reason = `同演员：${actorMatch}`;
  }

  if (profile.ipNames.includes(content.ipName)) {
    boost += 3800;
    reason = `同IP：${content.ipName}`;
  }

  const characterMatch = profile.characters.find(character => content.characters?.includes(character));
  if (characterMatch) {
    boost += 3200;
    reason = `同角色：${characterMatch}`;
  }

  const tagMatch = profile.tags.find(tag => content.tags?.includes(tag));
  if (tagMatch) {
    boost += 2000;
    if (!reason.startsWith('同')) {
      reason = `同标签：${tagMatch}`;
    }
  }

  return { boost, reason };
}

function buildUserProfile(history, type) {
  const watched = history
    .map(entry => entry.content)
    .filter(item => item && (!type || item.type === type));

  return {
    watchedIds: new Set(watched.map(item => item.id)),
    actors: [...new Set(watched.flatMap(item => item.actors || []).slice(0, 20))],
    characters: [...new Set(watched.flatMap(item => item.characters || []).slice(0, 30))],
    ipNames: [...new Set(watched.map(item => item.ipName).filter(Boolean).slice(0, 20))],
    tags: [...new Set(watched.flatMap(item => item.tags || []).slice(0, 30))],
  };
}

async function loadCandidatePool(type, limit, candidateLoader) {
  if (candidateLoader) {
    return uniqueById(await candidateLoader());
  }

  const size = Math.min(30, Math.max(10, limit * 2));
  let primary = listCachedContents({ type, page: 1, limit: size, sort: 'hot', stale: false });
  let latest = listCachedContents({ type, page: 1, limit: size, sort: 'latest', stale: false });

  if ((primary.list || []).length === 0 && (latest.list || []).length === 0) {
    await refreshContentType(type).catch(() => null);
    primary = listCachedContents({ type, page: 1, limit: size, sort: 'hot', stale: false });
    latest = listCachedContents({ type, page: 1, limit: size, sort: 'latest', stale: false });
  }

  return uniqueById([...(primary.list || []), ...(latest.list || [])]);
}

export async function getRecommendations({ type = 'drama', limit = 10, userId, candidateLoader }) {
  const limitNum = Math.min(30, Math.max(1, Number(limit) || 10));
  const pool = await loadCandidatePool(type, limitNum, candidateLoader);

  if (!userId) {
    return pool.slice(0, limitNum).map((item, index) => ({
      ...item,
      reason: ['近期热门', '口碑佳作', '趋势上升'][index % 3],
    }));
  }

  const user = getUserById(userId);
  if (!user) {
    return pool.slice(0, limitNum).map((item, index) => ({
      ...item,
      reason: ['近期热门', '口碑佳作', '趋势上升'][index % 3],
    }));
  }

  const history = listWatchHistory(userId);
  if (history.length === 0) {
    return pool.slice(0, limitNum).map((item, index) => ({
      ...item,
      reason: ['近期热门', '口碑佳作', '趋势上升'][index % 3],
    }));
  }

  const profile = buildUserProfile(history, type);

  const personalized = pool
    .filter(item => !profile.watchedIds.has(item.id))
    .map(item => {
      const { boost, reason } = scoreByProfile(item, profile);
      return {
        ...item,
        reason,
        _sortScore: Number(item.hotScore || 0) + boost,
      };
    })
    .sort((a, b) => b._sortScore - a._sortScore)
    .slice(0, limitNum)
    .map(({ _sortScore, ...rest }) => rest);

  if (personalized.length >= Math.min(5, limitNum)) {
    return personalized;
  }

  const supplemental = pool
    .filter(item => !personalized.some(entry => entry.id === item.id))
    .slice(0, limitNum - personalized.length)
    .map(item => ({ ...item, reason: '近期热门' }));

  return [...personalized, ...supplemental].slice(0, limitNum);
}
