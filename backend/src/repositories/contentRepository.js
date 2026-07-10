import { getDatabase } from '../db/database.js';
import { createApiError } from '../utils/apiErrors.js';
import { getCuratedChinaFilterPairs, isCurrentCuratedChinaTitle } from '../services/curatedRealContentService.js';

function serialize(value) {
  return JSON.stringify(value ?? []);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .trim();
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

const MAX_QUERY_PAGE = 1000;

const HEAT_METRIC_BY_TYPE = {
  drama: 'playback',
  novel: 'reading',
  anime: 'playback',
  comic: 'reading',
};

function normalizeHeatMetric(metric, type = 'drama') {
  const value = String(metric || '').trim().toLowerCase();
  if (value === 'playback' || value === 'reading') return value;
  return HEAT_METRIC_BY_TYPE[type] || 'playback';
}

function normalizeItemSource(item = {}) {
  if (item.source && typeof item.source === 'object') {
    return {
      provider: normalizeText(item.source.provider || item.source.label || 'unknown'),
      label: String(item.source.label || item.source.provider || 'Unknown').trim(),
      url: String(item.source.url || '').trim(),
      region: String(item.source.region || '').trim(),
    };
  }
  const provider = normalizeText(item.source || item.sourceId || 'unknown');
  return {
    provider,
    label: String(item.sourceName || item.sourceLabel || provider || 'Unknown').trim(),
    url: String(item.sourceUrl || item.url || '').trim(),
    region: String(item.region || '').trim(),
  };
}

function normalizeItemArray(primary, fallback, max = 12) {
  const value = Array.isArray(primary) ? primary : (Array.isArray(fallback) ? fallback : []);
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function normalizeItemMetrics(item = {}) {
  return item.metrics && typeof item.metrics === 'object' ? item.metrics : {};
}

function normalizeItemFieldSources(item = {}) {
  return Array.isArray(item.fieldSources) ? item.fieldSources : [];
}

function buildDedupeHash(item) {
  const normalized = normalizeTitle(item.title);
  const sourceProvider = normalizeText(item.source?.provider || item.source?.label || 'unknown');
  const ipName = normalizeText(item.ipName || item.title);
  return `${item.type}|${normalized}|${sourceProvider}|${ipName}`;
}

function jsonArraySearchExpression(jsonColumn, fieldAlias = 'item') {
  return `EXISTS (SELECT 1 FROM json_each(${jsonColumn}) ${fieldAlias} WHERE lower(${fieldAlias}.value) LIKE lower(?) ESCAPE '\\')`;
}

function tokenizeKeywordForFts(keyword) {
  return String(keyword || '')
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => `"${token.replace(/["*^()+:]/g, ' ')}"*`)
    .join(' OR ');
}

function normalizeSearchTerms(keyword, searchTerms = []) {
  const seen = new Set();
  const values = [];

  for (const item of [keyword, ...(Array.isArray(searchTerms) ? searchTerms : [])]) {
    const term = String(item || '').trim();
    if (!term) continue;
    const signature = term.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    values.push(term);
  }

  return values;
}

function tokenizeSearchTermsForFts(searchTerms = []) {
  return searchTerms
    .flatMap(term => String(term || '')
      .trim()
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean))
    .map(token => `"${token.replace(/["*^()+:]/g, ' ')}"*`)
    .join(' OR ');
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

const NON_REAL_SOURCE_PROVIDERS = new Set(['smoke', 'regression', 'visual']);
const LEGACY_OVERSEAS_SOURCE_PROVIDERS = new Set(['tvmaze']);

function includeNonRealFixtures() {
  return process.env.MEDIAHUB_INCLUDE_TEST_FIXTURES === 'true';
}

function buildCuratedChinaFilterClauses(typeColumn, titleColumn) {
  const pairs = getCuratedChinaFilterPairs();
  if (pairs.length === 0) return '0';
  return pairs.map(() => `(${typeColumn} = ? AND ${titleColumn} = ?)`).join(' OR ');
}

function getCuratedChinaFilterParams() {
  return getCuratedChinaFilterPairs().flatMap(pair => [pair.type, pair.title]);
}

function isRealSourceRow(row) {
  if (includeNonRealFixtures()) return true;
  const source = parseJson(row.source_json, {});
  const provider = normalizeText(source.provider || source.label);
  if (NON_REAL_SOURCE_PROVIDERS.has(provider) || LEGACY_OVERSEAS_SOURCE_PROVIDERS.has(provider)) return false;
  if (provider === 'curated-real') return isCurrentCuratedChinaTitle(row.type, row.title);
  return true;
}

function getRealSourceFilterClause(alias = '') {
  if (includeNonRealFixtures()) return '';
  const column = alias ? `${alias}.source_json` : 'source_json';
  const typeColumn = alias ? `${alias}.type` : 'type';
  const titleColumn = alias ? `${alias}.title` : 'title';
  const providerExpression = `lower(COALESCE(json_extract(${column}, '$.provider'), json_extract(${column}, '$.label'), ''))`;
  const placeholders = [...NON_REAL_SOURCE_PROVIDERS, ...LEGACY_OVERSEAS_SOURCE_PROVIDERS].map(() => '?').join(', ');
  const curatedChinaClauses = buildCuratedChinaFilterClauses(typeColumn, titleColumn);
  return ` AND ${providerExpression} NOT IN (${placeholders}) AND (${providerExpression} != ? OR ${curatedChinaClauses})`;
}

function getRealSourceFilterParams() {
  return includeNonRealFixtures()
    ? []
    : [...NON_REAL_SOURCE_PROVIDERS, ...LEGACY_OVERSEAS_SOURCE_PROVIDERS, 'curated-real', ...getCuratedChinaFilterParams()];
}

function rowToContent(row, stale = true) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    type: row.type,
    tags: parseJson(row.tags_json, []),
    actors: parseJson(row.actors_json, []),
    characters: parseJson(row.characters_json || '[]', []),
    author: row.author || '',
    ipName: row.ip_name || row.title,
    status: row.status || 'completed',
    hotScore: Number(row.hot_score) || 0,
    heatMetric: normalizeHeatMetric(row.heat_metric, row.type),
    releaseDate: row.release_date || '',
    contentType: row.content_type || '',
    copyrightOwner: row.copyright_owner || '',
    metrics: parseJson(row.metrics_json || '{}', {}),
    fieldSources: parseJson(row.field_sources_json || '[]', []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cachedAt: row.cached_at,
    stale,
    source: parseJson(row.source_json, { provider: 'unknown', label: 'Unknown', url: '' }),
  };
}

function upsertContents(contents = []) {
  if (contents.length === 0) return 0;
  const db = getDatabase();
  const now = new Date().toISOString();

  const findExistingStmt = db.prepare('SELECT id FROM contents WHERE id = ? OR dedupe_hash = ? LIMIT 1');
  const upsertStmt = db.prepare(`
    INSERT INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score, heat_metric,
      tags_json, actors_json, characters_json, source_json, created_at, updated_at, cached_at,
      metrics_json, field_sources_json, release_date, content_type, copyright_owner,
      normalized_title, dedupe_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      cover = excluded.cover,
      summary = excluded.summary,
      author = excluded.author,
      ip_name = excluded.ip_name,
      status = excluded.status,
      hot_score = excluded.hot_score,
      heat_metric = excluded.heat_metric,
      tags_json = excluded.tags_json,
      actors_json = excluded.actors_json,
      characters_json = excluded.characters_json,
      source_json = excluded.source_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      cached_at = excluded.cached_at,
      metrics_json = excluded.metrics_json,
      field_sources_json = excluded.field_sources_json,
      release_date = excluded.release_date,
      content_type = excluded.content_type,
      copyright_owner = excluded.copyright_owner,
      normalized_title = excluded.normalized_title,
      dedupe_hash = excluded.dedupe_hash
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const item of contents) {
      const normalizedTitle = normalizeTitle(item.title);
      const dedupeHash = buildDedupeHash(item);
      const existing = findExistingStmt.get(item.id, dedupeHash);
      const persistentId = existing?.id || item.id;

      const normalizedSource = normalizeItemSource(item);
      const tags = normalizeItemArray(item.tags, item.categories, 8);
      const actors = normalizeItemArray(item.actors, [], 8);
      const characters = normalizeItemArray(item.characters, [], 12);
      const result = upsertStmt.run(
        persistentId,
        item.type,
        item.title,
        item.cover,
        item.summary,
        item.author || '',
        item.ipName || item.title,
        item.status || 'completed',
        Number(item.hotScore) || 0,
        normalizeHeatMetric(item.heatMetric, item.type),
        serialize(tags),
        serialize(actors),
        serialize(characters),
        JSON.stringify(normalizedSource),
        item.createdAt || item.capturedAt || now,
        item.updatedAt || item.capturedAt || now,
        now,
        JSON.stringify(normalizeItemMetrics(item)),
        JSON.stringify(normalizeItemFieldSources(item)),
        item.releaseDate || '',
        item.contentType || '',
        item.copyrightOwner || '',
        normalizedTitle,
        dedupeHash,
      );
      count += Number(result?.changes || 0);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return count;
}

function listCachedContents({
  type,
  page = 1,
  limit = 20,
  sort = 'hot',
  keyword = '',
  searchTerms = [],
  minHotScore = 0,
  stale = true,
}) {
  const db = getDatabase();
  const pageNum = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const orderBy = sort === 'latest' ? 'updated_at DESC' : 'hot_score DESC';
  const normalizedKeyword = String(keyword || '').trim();
  const normalizedSearchTerms = normalizeSearchTerms(normalizedKeyword, searchTerms);
  const hotScoreFloor = Math.max(0, Number(minHotScore) || 0);
  const likeTerms = normalizedSearchTerms.map(term => `%${escapeLike(term)}%`);

  if (normalizedSearchTerms.length > 0) {
    const ftsQuery = tokenizeSearchTermsForFts(normalizedSearchTerms);
    if (ftsQuery) {
      try {
        const realSourceFilter = getRealSourceFilterClause('c');
        const realSourceParams = getRealSourceFilterParams();
        const countRow = db.prepare(`
          SELECT COUNT(*) AS total
          FROM contents_fts
          JOIN contents c ON c.rowid = contents_fts.rowid
          WHERE contents_fts MATCH ? AND c.type = ? AND c.hot_score >= ?${realSourceFilter}
        `).get(ftsQuery, type, hotScoreFloor, ...realSourceParams);

        const rows = db.prepare(`
          SELECT c.*
          FROM contents_fts
          JOIN contents c ON c.rowid = contents_fts.rowid
          WHERE contents_fts MATCH ? AND c.type = ? AND c.hot_score >= ?${realSourceFilter}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `).all(ftsQuery, type, hotScoreFloor, ...realSourceParams, limitNum, offset);

        if (rows.length > 0 || Number(countRow?.total) > 0) {
          return {
            list: rows.map(row => rowToContent(row, stale)),
            pagination: { page: pageNum, limit: limitNum, total: Number(countRow?.total) || 0 },
            stale,
          };
        }
      } catch (ftsError) {
        // FTS query syntax error, fall through to LIKE search
      }
    }

    if (likeTerms.length > 0) {
      const realSourceFilter = getRealSourceFilterClause();
      const realSourceParams = getRealSourceFilterParams();
      const perTermClause = `(
        lower(title) LIKE lower(?) ESCAPE '\\'
        OR lower(summary) LIKE lower(?) ESCAPE '\\'
        OR lower(author) LIKE lower(?) ESCAPE '\\'
        OR lower(ip_name) LIKE lower(?) ESCAPE '\\'
        OR ${jsonArraySearchExpression('contents.actors_json', 'actor')}
        OR ${jsonArraySearchExpression('contents.characters_json', 'character')}
        OR ${jsonArraySearchExpression('contents.tags_json', 'tag')}
      )`;
      const keywordWhere = likeTerms.map(() => perTermClause).join(' OR ');
      const keywordParams = likeTerms.flatMap(term => [term, term, term, term, term, term, term]);
      const where = `WHERE type = ? AND hot_score >= ? AND (${keywordWhere})${realSourceFilter}`;
      const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${where}`).get(type, hotScoreFloor, ...keywordParams, ...realSourceParams).total;
      const rows = db.prepare(`SELECT * FROM contents ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .all(type, hotScoreFloor, ...keywordParams, ...realSourceParams, limitNum, offset);

      return {
        list: rows.map(row => rowToContent(row, stale)),
        pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
        stale,
      };
    }
  }

  const realSourceFilter = getRealSourceFilterClause();
  const realSourceParams = getRealSourceFilterParams();
  const where = `WHERE type = ? AND hot_score >= ?${realSourceFilter}`;
  const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${where}`).get(type, hotScoreFloor, ...realSourceParams).total;
  const rows = db.prepare(`SELECT * FROM contents ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(type, hotScoreFloor, ...realSourceParams, limitNum, offset);

  return {
    list: rows.map(row => rowToContent(row, stale)),
    pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
    stale,
  };
}

function listCachedContentsByTopic({
  field,
  value,
  type = '',
  page = 1,
  limit = 20,
  sort = 'hot',
  minHotScore = 0,
  stale = true,
}) {
  const db = getDatabase();
  const topicField = String(field || '').trim();
  const topicValue = String(value || '').trim();
  if (!topicValue) {
    return {
      field: topicField,
      value: topicValue,
      typeFilter: type || '',
      minHotScore: Number(minHotScore) || 0,
      list: [],
      pagination: { page: 1, limit: Math.min(50, Math.max(1, Number(limit) || 20)), total: 0 },
      stale,
    };
  }

  const validField = topicField === 'actor'
    || topicField === 'character'
    || topicField === 'author'
    || topicField === 'ip'
    || topicField === 'category';
  if (!validField) throw createApiError('invalid_request', 'Invalid topic field. Must be actor, character, author, ip, or category');

  const pageNum = Math.min(MAX_QUERY_PAGE, Math.max(1, Number(page) || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const orderBy = sort === 'latest' ? 'updated_at DESC' : 'hot_score DESC';
  const hotScoreFloor = Math.max(0, Number(minHotScore) || 0);
  const params = [];
  const where = [`hot_score >= ?`];
  params.push(hotScoreFloor);

  if (String(type || '').trim()) {
    where.push('type = ?');
    params.push(String(type).trim());
  }

  if (topicField === 'author') {
    where.push("lower(author) LIKE lower(?) ESCAPE '\\'");
    params.push(`%${escapeLike(topicValue)}%`);
  } else if (topicField === 'ip') {
    where.push("lower(ip_name) LIKE lower(?) ESCAPE '\\'");
    params.push(`%${escapeLike(topicValue)}%`);
  } else if (topicField === 'character') {
    where.push("EXISTS (SELECT 1 FROM json_each(contents.characters_json) character WHERE lower(character.value) LIKE lower(?) ESCAPE '\\')");
    params.push(`%${escapeLike(topicValue)}%`);
  } else if (topicField === 'category') {
    where.push("EXISTS (SELECT 1 FROM json_each(contents.tags_json) tag WHERE lower(tag.value) LIKE lower(?) ESCAPE '\\')");
    params.push(`%${escapeLike(topicValue)}%`);
  } else {
    where.push("EXISTS (SELECT 1 FROM json_each(contents.actors_json) actor WHERE lower(actor.value) LIKE lower(?) ESCAPE '\\')");
    params.push(`%${escapeLike(topicValue)}%`);
  }

  const realSourceFilter = getRealSourceFilterClause();
  const realSourceParams = getRealSourceFilterParams();
  const whereClause = `WHERE ${where.join(' AND ')}${realSourceFilter}`;
  const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${whereClause}`).get(...params, ...realSourceParams).total;
  const rows = db.prepare(`
    SELECT *
    FROM contents
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, ...realSourceParams, limitNum, offset);

  return {
    field: topicField,
    value: topicValue,
    typeFilter: String(type || '').trim(),
    minHotScore: hotScoreFloor,
    list: rows.map(row => rowToContent(row, stale)),
    pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
    stale,
  };
}

function listAllCachedContentsByTopic({ field, value, type = '', limit = 80, minHotScore = 0 }) {
  const result = listCachedContentsByTopic({
    field,
    value,
    type,
    page: 1,
    limit: Math.min(100, Math.max(1, Number(limit) || 80)),
    sort: 'hot',
    minHotScore,
    stale: false,
  });
  return result.list || [];
}

function listCachedContentsByIds(ids = []) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean))].slice(0, 8);
  if (uniqueIds.length === 0) return [];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = getDatabase().prepare(`SELECT * FROM contents WHERE id IN (${placeholders})`).all(...uniqueIds);
  const byId = new Map(rows.map(row => [row.id, rowToContent(row, false)]));
  return uniqueIds.map(id => byId.get(id)).filter(Boolean);
}

function discoverCachedContents({
  keyword = '',
  page = 1,
  limit = 8,
  sort = 'hot',
  minHotScore = 0,
  searchTermsByType = {},
  stale = true,
}) {
  const normalizedKeyword = String(keyword || '').trim();
  const types = ['drama', 'novel', 'anime', 'comic'];
  const groups = Object.fromEntries(types.map(type => [type, []]));
  const counts = Object.fromEntries(types.map(type => [type, 0]));
  let total = 0;

  for (const type of types) {
    const searchTerms = Array.isArray(searchTermsByType?.[type]) ? searchTermsByType[type] : [];
    const result = listCachedContents({
      type,
      page,
      limit,
      sort,
      keyword: normalizedKeyword,
      searchTerms,
      stale,
    });
    const filtered = (result.list || []).filter(item => Number(item.hotScore) >= Math.max(0, Number(minHotScore) || 0));
    groups[type] = filtered;
    counts[type] = filtered.length;
    total += filtered.length;
  }

  return {
    keyword: normalizedKeyword,
    sort,
    minHotScore: Math.max(0, Number(minHotScore) || 0),
    total,
    counts,
    groups,
    stale,
  };
}

function getCachedContentById(contentId, { stale = true } = {}) {
  const row = getDatabase().prepare('SELECT * FROM contents WHERE id = ?').get(contentId);
  if (row && !isRealSourceRow(row)) return null;
  return rowToContent(row, stale);
}

function countCachedContentsByType(type) {
  const realSourceFilter = getRealSourceFilterClause();
  const realSourceParams = getRealSourceFilterParams();
  const row = getDatabase().prepare(`SELECT COUNT(*) as total FROM contents WHERE type = ?${realSourceFilter}`).get(type, ...realSourceParams);
  return Number(row?.total) || 0;
}

function updateCachedContent(contentId, patch = {}) {
  const current = getCachedContentById(contentId, { stale: false });
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    tags: Array.isArray(patch.tags) ? patch.tags : current.tags,
    actors: Array.isArray(patch.actors) ? patch.actors : current.actors,
    characters: Array.isArray(patch.characters) ? patch.characters : (current.characters || []),
    hotScore: patch.hotScore === undefined ? current.hotScore : Number(patch.hotScore) || 0,
    heatMetric: normalizeHeatMetric(patch.heatMetric, patch.type || current.type),
    updatedAt: new Date().toISOString(),
  };

  upsertContents([next]);
  return getCachedContentById(contentId, { stale: false });
}

function listContentQualityStats() {
  const rows = getDatabase().prepare('SELECT * FROM contents ORDER BY updated_at DESC LIMIT 10000').all();
  const byType = new Map();
  const duplicateGroups = new Map();
  const boundaryRisks = [];
  const reviewQueue = [];
  const totals = {
    total: 0,
    missingCover: 0,
    missingSummary: 0,
    missingTags: 0,
    lowHotScore: 0,
  };

  for (const row of rows) {
    const item = rowToContent(row, false);
    if (!item) continue;
    totals.total += 1;
    const typeStats = byType.get(item.type) || {
      type: item.type,
      total: 0,
      missingCover: 0,
      missingSummary: 0,
      missingTags: 0,
      lowHotScore: 0,
    };
    typeStats.total += 1;

    const missingCover = !String(item.cover || '').trim();
    const missingSummary = !String(item.summary || '').trim() || item.summary.length < 8;
    const missingTags = !Array.isArray(item.tags) || item.tags.length === 0;
    const lowHotScore = Number(item.hotScore) < 100;

    if (missingCover) { totals.missingCover += 1; typeStats.missingCover += 1; }
    if (missingSummary) { totals.missingSummary += 1; typeStats.missingSummary += 1; }
    if (missingTags) { totals.missingTags += 1; typeStats.missingTags += 1; }
    if (lowHotScore) { totals.lowHotScore += 1; typeStats.lowHotScore += 1; }
    byType.set(item.type, typeStats);

    const issueCodes = [
      missingCover ? 'missing_cover' : '',
      missingSummary ? 'missing_summary' : '',
      missingTags ? 'missing_tags' : '',
      lowHotScore ? 'low_hot_score' : '',
    ].filter(Boolean);
    if (issueCodes.length > 0) {
      reviewQueue.push({
        id: item.id,
        title: item.title,
        type: item.type,
        issues: issueCodes,
        suggestion: issueCodes.some(code => code === 'missing_summary' || code === 'missing_tags')
          ? '建议补全平台来源字段后人工审核'
          : '建议人工核验热度来源',
      });
    }

    const text = `${item.title} ${item.summary} ${item.ipName} ${(item.tags || []).join(' ')}`.toLowerCase();
    if (item.type === 'drama' && /(电视剧|长剧|卫视|集电视剧|连续剧)/.test(text)) {
      boundaryRisks.push({ id: item.id, title: item.title, type: item.type, reason: '短剧入口疑似混入长剧/电视剧描述' });
    }
    if ((item.type === 'novel' || item.type === 'comic') && item.heatMetric !== 'reading') {
      boundaryRisks.push({ id: item.id, title: item.title, type: item.type, reason: `${item.type === 'novel' ? '小说' : '漫画'}应使用阅读量口径` });
    }
    if ((item.type === 'drama' || item.type === 'anime') && item.heatMetric !== 'playback') {
      boundaryRisks.push({ id: item.id, title: item.title, type: item.type, reason: `${item.type === 'drama' ? '短剧' : '动漫'}应使用播放量口径` });
    }

    const duplicateKey = `${item.type}|${normalizeTitle(item.title)}|${normalizeText(item.ipName || '')}`;
    const duplicateList = duplicateGroups.get(duplicateKey) || [];
    duplicateList.push({ id: item.id, title: item.title, type: item.type, ipName: item.ipName, hotScore: item.hotScore });
    duplicateGroups.set(duplicateKey, duplicateList);
  }

  const issueCount = totals.missingCover + totals.missingSummary + totals.missingTags + totals.lowHotScore;
  const qualityScore = totals.total === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 - (issueCount / (totals.total * 4)) * 100)));

  return {
    ...totals,
    qualityScore,
    byType: [...byType.values()].sort((a, b) => a.type.localeCompare(b.type)),
    duplicateCandidates: [...duplicateGroups.values()]
      .filter(group => group.length > 1)
      .slice(0, 20),
    boundaryRisks: boundaryRisks.slice(0, 30),
    reviewQueue: reviewQueue.slice(0, 30),
  };
}

export {
  upsertContents,
  listCachedContents,
  listCachedContentsByTopic,
  listAllCachedContentsByTopic,
  listCachedContentsByIds,
  discoverCachedContents,
  getCachedContentById,
  countCachedContentsByType,
  updateCachedContent,
  listContentQualityStats,
  rowToContent,
  normalizeTitle,
  buildDedupeHash,
  tokenizeKeywordForFts,
};
