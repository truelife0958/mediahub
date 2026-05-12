import { createApiError } from '../utils/apiErrors.js';
import { fetchJson } from './httpService.js';
import { normalizeContent, DEFAULT_COVER, cleanText } from './contentNormalizer.js';
import { upsertContents, listCachedContents, getCachedContentById } from '../repositories/contentRepository.js';

const TVMAZE_BASE_URL = 'https://api.tvmaze.com';
const OPENLIB_BASE_URL = 'https://openlibrary.org';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const CACHE_TTL_MS = Math.max(15_000, Number(process.env.CACHE_TTL_MS || 180_000));
const cacheStore = new Map();

function buildCacheKey(type, params) {
  return `${type}:${JSON.stringify(params)}`;
}

function getCached(key) {
  const hit = cacheStore.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value, ttlMs = CACHE_TTL_MS) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function getOrSetCache(key, loader, ttlMs = CACHE_TTL_MS) {
  const cached = getCached(key);
  if (cached) return cached;
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}

function ensureType(type) {
  if (!['drama', 'novel', 'comic', 'anime'].includes(type)) {
    throw createApiError('invalid_request', 'Invalid content type');
  }
}

function sortContents(list, sort = 'hot') {
  const data = [...list];
  data.sort((a, b) => {
    if (sort === 'latest') return new Date(b.createdAt) - new Date(a.createdAt);
    return b.hotScore - a.hotScore;
  });
  return data;
}

function mapTvMazeShow(show) {
  const summary = cleanText(show.summary, `${show.name || '该作品'}暂无简介`);
  const networkName = show.network?.name || show.webChannel?.name || 'TVMaze';
  const genres = Array.isArray(show.genres) ? show.genres.slice(0, 6) : [];
  const castNames = Array.isArray(show._embedded?.cast)
    ? show._embedded.cast
      .map(item => item?.person?.name)
      .filter(Boolean)
      .slice(0, 6)
    : [];

  return normalizeContent({
    id: `drama:tvmaze:${show.id}`,
    title: show.name || '未知短剧',
    cover: show.image?.original || show.image?.medium || DEFAULT_COVER,
    summary,
    type: 'drama',
    tags: genres,
    actors: castNames,
    author: networkName,
    ipName: show.externals?.imdb || show.name || `tvmaze-${show.id}`,
    status: String(show.status || '').toLowerCase(),
    hotScore: Math.max(100, Math.round((show.weight || 0) * 10 + (show.rating?.average || 0) * 1000)),
    createdAt: show.premiered || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      provider: 'tvmaze',
      label: 'TVMaze',
      url: `${TVMAZE_BASE_URL}/shows/${encodeURIComponent(show.id)}`,
    },
  });
}

function mapOpenLibraryDoc(doc, type) {
  const title = doc.title || '未知作品';
  const author = Array.isArray(doc.author_name) ? doc.author_name[0] : 'Open Library';
  const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 6) : [];
  const key = doc.key || '';
  const workId = key.replace('/works/', '');

  return normalizeContent({
    id: `${type}:openlibrary:${workId || encodeURIComponent(title)}`,
    title,
    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : DEFAULT_COVER,
    summary: `${title} · ${author} · 首次出版 ${doc.first_publish_year || '未知年份'}`,
    type,
    tags: subjects,
    actors: [],
    author,
    ipName: workId || title,
    status: doc.ratings_average ? 'ongoing' : 'completed',
    hotScore: Math.max(80, Number(doc.ratings_average || 0) * 1000 + Number(doc.edition_count || 0) * 25),
    createdAt: doc.first_publish_year ? `${doc.first_publish_year}-01-01T00:00:00.000Z` : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      provider: 'openlibrary',
      label: 'Open Library',
      url: `${OPENLIB_BASE_URL}/works/${encodeURIComponent(workId || key)}`,
    },
  });
}

function mapJikanAnime(anime) {
  const genres = Array.isArray(anime.genres) ? anime.genres.map(g => g.name).slice(0, 6) : [];
  const studios = Array.isArray(anime.studios) ? anime.studios.map(s => s.name).filter(Boolean) : [];
  const synopsis = cleanText(anime.synopsis, `${anime.title || '该动漫'}暂无简介`);

  return normalizeContent({
    id: `anime:jikan:${anime.mal_id}`,
    title: anime.title || anime.title_english || anime.title_japanese || '未知动漫',
    cover: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || DEFAULT_COVER,
    summary: synopsis,
    type: 'anime',
    tags: genres,
    actors: studios.slice(0, 6),
    author: anime.source || 'MyAnimeList',
    ipName: anime.title || `anime-${anime.mal_id}`,
    status: String(anime.status || '').toLowerCase(),
    hotScore: Math.max(100, Math.round((anime.popularity ? (10_000 - anime.popularity) : 0) + (anime.score || 0) * 1000)),
    createdAt: anime.aired?.from || anime.year || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      provider: 'jikan',
      label: 'Jikan',
      url: `${JIKAN_BASE_URL}/anime/${encodeURIComponent(anime.mal_id)}`,
    },
  });
}

function parseContentId(contentId) {
  const [type, provider, rawId] = String(contentId || '').split(':');
  if (!type || !provider || !rawId) {
    throw createApiError('invalid_request', 'Invalid content id');
  }
  if (provider === 'fallback') {
    throw createApiError('invalid_request', 'Unsupported content source');
  }
  return { type, provider, rawId };
}

async function fetchDramaList({ keyword, page, limit }) {
  if (keyword) {
    const searchResults = await fetchJson(`${TVMAZE_BASE_URL}/search/shows?q=${encodeURIComponent(keyword)}`);
    const mapped = searchResults.map(item => mapTvMazeShow(item.show));
    return {
      list: mapped.slice((page - 1) * limit, page * limit),
      total: mapped.length,
    };
  }

  const upstreamPage = Math.max(0, page - 1);
  const list = await fetchJson(`${TVMAZE_BASE_URL}/shows?page=${upstreamPage}`);
  const mapped = list.map(mapTvMazeShow);
  return {
    list: mapped.slice(0, limit),
    total: upstreamPage * 250 + mapped.length,
  };
}

async function fetchOpenLibraryList({ type, keyword, page, limit }) {
  const baseKeyword = keyword || (type === 'comic' ? 'graphic novel manga' : 'bestseller novel');
  const searchParams = new URLSearchParams({
    q: baseKeyword,
    fields: 'key,title,author_name,cover_i,first_publish_year,subject,edition_count,ratings_average',
    limit: String(limit),
    page: String(page),
  });

  if (type === 'comic') {
    searchParams.set('q', `${baseKeyword} subject:manga OR subject:comics`);
  } else if (type === 'novel') {
    searchParams.set('q', `${baseKeyword} subject:fiction`);
  }

  const data = await fetchJson(`${OPENLIB_BASE_URL}/search.json?${searchParams.toString()}`);
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const mapped = docs.map(doc => mapOpenLibraryDoc(doc, type));

  return {
    list: mapped,
    total: Number(data.num_found || mapped.length),
  };
}

async function fetchAnimeList({ keyword, page, limit }) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (keyword) {
    searchParams.set('q', keyword);
    searchParams.set('order_by', 'score');
    searchParams.set('sort', 'desc');
  }

  const endpoint = keyword ? '/anime' : '/top/anime';
  const data = await fetchJson(`${JIKAN_BASE_URL}${endpoint}?${searchParams.toString()}`);
  const list = Array.isArray(data.data) ? data.data : [];
  const mapped = list.map(mapJikanAnime);

  const total = Number(data.pagination?.items?.total || data.pagination?.last_visible_page * limit || mapped.length);

  return {
    list: mapped,
    total,
  };
}

async function fetchListByType({ type, keyword = '', page = 1, limit = 20, sort = 'hot', __skipLiveFetchForTest = false, __bypassCacheFallback = false }) {
  ensureType(type);

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const normalizedKeyword = String(keyword || '').trim().slice(0, 80);
  const cacheKey = buildCacheKey('list', { type, keyword: normalizedKeyword, page: pageNum, limit: limitNum, sort });

  return getOrSetCache(cacheKey, async () => {
    if (__skipLiveFetchForTest) {
      throw createApiError('upstream_unavailable', 'Test upstream failure');
    }

    let payload;
    if (type === 'drama') {
      payload = await fetchDramaList({ keyword: normalizedKeyword, page: pageNum, limit: limitNum });
    } else if (type === 'anime') {
      payload = await fetchAnimeList({ keyword: normalizedKeyword, page: pageNum, limit: limitNum });
    } else {
      payload = await fetchOpenLibraryList({ type, keyword: normalizedKeyword, page: pageNum, limit: limitNum });
    }

    const list = sortContents(payload.list, sort);
    upsertContents(list);

    return {
      list,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(payload.total || list.length),
      },
      stale: false,
    };
  });
}

async function fetchDramaDetail(rawId) {
  const data = await fetchJson(`${TVMAZE_BASE_URL}/shows/${encodeURIComponent(rawId)}?embed[]=cast`);
  return mapTvMazeShow(data);
}

async function fetchOpenLibraryDetail({ type, rawId }) {
  const workId = rawId.startsWith('OL') ? rawId : rawId;
  const data = await fetchJson(`${OPENLIB_BASE_URL}/works/${encodeURIComponent(workId)}.json`);

  const title = data.title || '未知作品';
  const description = typeof data.description === 'string'
    ? data.description
    : (data.description?.value || `${title}暂无简介`);

  const coverId = Array.isArray(data.covers) ? data.covers[0] : null;
  const subjects = Array.isArray(data.subjects) ? data.subjects.slice(0, 6) : [];
  const authorName = Array.isArray(data.authors) && data.authors.length > 0
    ? 'Open Library Author'
    : 'Open Library';

  return normalizeContent({
    id: `${type}:openlibrary:${workId}`,
    title,
    cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : DEFAULT_COVER,
    summary: cleanText(description, `${title}暂无简介`),
    type,
    tags: subjects,
    actors: [],
    author: authorName,
    ipName: workId,
    status: 'completed',
    hotScore: Math.max(100, Number(data.latest_revision || 1) * 150),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      provider: 'openlibrary',
      label: 'Open Library',
      url: `${OPENLIB_BASE_URL}/works/${encodeURIComponent(workId)}`,
    },
  });
}

async function fetchAnimeDetail(rawId) {
  const data = await fetchJson(`${JIKAN_BASE_URL}/anime/${encodeURIComponent(rawId)}`);
  return mapJikanAnime(data.data || {});
}

async function fetchDetailById(contentId) {
  const parsed = parseContentId(contentId);
  let content;

  if (parsed.type === 'drama' && parsed.provider === 'tvmaze') {
    content = await fetchDramaDetail(parsed.rawId);
  } else if ((parsed.type === 'novel' || parsed.type === 'comic') && parsed.provider === 'openlibrary') {
    content = await fetchOpenLibraryDetail(parsed);
  } else if (parsed.type === 'anime' && parsed.provider === 'jikan') {
    content = await fetchAnimeDetail(parsed.rawId);
  } else {
    throw createApiError('invalid_request', 'Unsupported content source');
  }

  upsertContents([content]);

  const relatedListResult = await fetchListByType({
    type: content.type,
    keyword: content.ipName || content.title,
    page: 1,
    limit: 8,
    sort: 'hot',
  }).catch(() => ({ list: [], pagination: { page: 1, limit: 8, total: 0 } }));

  const similarListResult = await fetchListByType({
    type: content.type,
    keyword: (content.tags && content.tags[0]) || content.title,
    page: 1,
    limit: 8,
    sort: 'hot',
  }).catch(() => ({ list: [], pagination: { page: 1, limit: 8, total: 0 } }));

  const relatedContents = relatedListResult.list.filter(item => item.id !== content.id).slice(0, 5);
  const similarContents = similarListResult.list.filter(item => item.id !== content.id).slice(0, 5);

  return {
    ...content,
    relatedContents,
    similarContents,
  };
}

async function listContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '', __skipLiveFetchForTest = false, __bypassCacheFallback = false }) {
  try {
    return await fetchListByType({ type, page, limit, sort, keyword, __skipLiveFetchForTest, __bypassCacheFallback });
  } catch (error) {
    if (!__bypassCacheFallback) {
      const cached = listCachedContents({ type, page, limit, sort, keyword });
      if (cached.list.length > 0) return cached;
    }
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', `上游内容服务不可用: ${error.message}`, { error });
  }
}

async function getContentById(contentId) {
  try {
    return await fetchDetailById(contentId);
  } catch (error) {
    const cached = getCachedContentById(contentId);
    if (cached) return { ...cached, relatedContents: [], similarContents: [] };
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', `获取内容详情失败: ${error.message}`, { error });
  }
}

export { listContents, getContentById, fetchListByType, parseContentId };
