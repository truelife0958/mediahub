import { createApiError } from '../utils/apiErrors.js';
import {
  createSearchAliasGroup as createSearchAliasGroupRecord,
  deleteSearchAliasGroup as deleteSearchAliasGroupRecord,
  getSearchAliasGroupById,
  listSearchAliasGroups as listSearchAliasGroupRecords,
  updateSearchAliasGroup as updateSearchAliasGroupRecord,
} from '../repositories/searchAliasRepository.js';

const CONTENT_TYPES = ['drama', 'novel', 'anime', 'comic'];
const MAX_ALIAS_TERMS = 12;
const MAX_TERM_LENGTH = 80;

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeDisplayTerm(value) {
  return String(value || '').trim().slice(0, MAX_TERM_LENGTH);
}

function normalizeComparableTerm(value) {
  return normalizeDisplayTerm(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function normalizeType(value, { required = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw createApiError('invalid_request', 'type is required');
    return '';
  }
  if (!CONTENT_TYPES.includes(normalized)) {
    throw createApiError('invalid_request', 'type must be one of drama/novel/anime/comic');
  }
  return normalized;
}

function normalizeAliases(value, canonicalKeyword = '') {
  const seed = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,，、]/);

  const canonicalComparable = normalizeComparableTerm(canonicalKeyword);
  const seen = new Set(canonicalComparable ? [canonicalComparable] : []);
  const aliases = [];

  for (const item of seed) {
    const term = normalizeDisplayTerm(item);
    const comparable = normalizeComparableTerm(term);
    if (!term || !comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    aliases.push(term);
    if (aliases.length >= MAX_ALIAS_TERMS) break;
  }

  return aliases;
}

function normalizeEnabled(value, fallback = true) {
  if (value === undefined) return Boolean(fallback);
  return Boolean(value);
}

function normalizeNotes(value) {
  return String(value || '').trim().slice(0, 240);
}

function normalizeAliasGroupPayload(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createApiError('invalid_request', 'Invalid search alias payload');
  }

  const patch = {};

  if (!partial || hasOwn(input, 'canonicalKeyword')) {
    const canonicalKeyword = normalizeDisplayTerm(input.canonicalKeyword);
    if (!canonicalKeyword) {
      throw createApiError('invalid_request', 'canonicalKeyword is required');
    }
    patch.canonicalKeyword = canonicalKeyword;
  }

  const canonicalForAliases = patch.canonicalKeyword || normalizeDisplayTerm(input.canonicalKeyword);
  if (!partial || hasOwn(input, 'aliases')) {
    patch.aliases = normalizeAliases(input.aliases, canonicalForAliases);
  }

  if (!partial || hasOwn(input, 'type')) {
    patch.type = normalizeType(input.type);
  }

  if (!partial || hasOwn(input, 'enabled')) {
    patch.enabled = normalizeEnabled(input.enabled, true);
  }

  if (!partial || hasOwn(input, 'notes')) {
    patch.notes = normalizeNotes(input.notes);
  }

  return patch;
}

function assertNoConflictingCanonical({ id = 0, canonicalKeyword, type = '' }) {
  const canonicalComparable = normalizeComparableTerm(canonicalKeyword);
  const conflict = listSearchAliasGroupRecords({ type })
    .find(item => item.id !== Number(id || 0) && normalizeComparableTerm(item.canonicalKeyword) === canonicalComparable);

  if (conflict) {
    throw createApiError('invalid_request', '当前分类下已存在相同主词');
  }
}

function listSearchAliasGroups({ type = '', enabled } = {}) {
  const query = {};
  const normalizedType = normalizeType(type);
  if (normalizedType) query.type = normalizedType;
  if (enabled !== undefined) query.enabled = Boolean(enabled);
  return listSearchAliasGroupRecords(query);
}

function createSearchAliasGroup(payload = {}) {
  const normalized = normalizeAliasGroupPayload(payload, { partial: false });
  assertNoConflictingCanonical({ canonicalKeyword: normalized.canonicalKeyword, type: normalized.type });

  try {
    return createSearchAliasGroupRecord(normalized);
  } catch (error) {
    if (error?.publicCode) throw error;
    throw createApiError('invalid_request', error?.message || 'create search alias failed');
  }
}

function updateSearchAliasGroup(id, payload = {}) {
  const current = getSearchAliasGroupById(id);
  if (!current) throw createApiError('not_found', 'search alias group not found');

  const normalizedPatch = normalizeAliasGroupPayload(payload, { partial: true });
  const next = {
    canonicalKeyword: normalizedPatch.canonicalKeyword ?? current.canonicalKeyword,
    aliases: normalizedPatch.aliases ?? current.aliases,
    type: normalizedPatch.type ?? current.type,
    enabled: normalizedPatch.enabled ?? current.enabled,
    notes: normalizedPatch.notes ?? current.notes,
  };

  assertNoConflictingCanonical({ id: current.id, canonicalKeyword: next.canonicalKeyword, type: next.type });

  try {
    return updateSearchAliasGroupRecord(current.id, next);
  } catch (error) {
    if (error?.publicCode) throw error;
    throw createApiError('invalid_request', error?.message || 'update search alias failed');
  }
}

function deleteSearchAliasGroup(id) {
  const current = getSearchAliasGroupById(id);
  if (!current) throw createApiError('not_found', 'search alias group not found');
  const deleted = deleteSearchAliasGroupRecord(current.id);
  if (!deleted) throw createApiError('not_found', 'search alias group not found');
  return { deleted: true, id: current.id };
}

function buildGroupTerms(group) {
  return [group.canonicalKeyword, ...(Array.isArray(group.aliases) ? group.aliases : [])]
    .map(term => normalizeDisplayTerm(term))
    .filter(Boolean);
}

function shouldApplyGroup(keywordComparable, groupTerms) {
  if (!keywordComparable) return false;

  return groupTerms.some((term) => {
    const normalizedTerm = normalizeComparableTerm(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm === keywordComparable) return true;
    if (keywordComparable.length >= 2 && normalizedTerm.includes(keywordComparable)) return true;
    if (normalizedTerm.length >= 2 && keywordComparable.includes(normalizedTerm)) return true;
    return false;
  });
}

function resolveSearchAliasContext(keyword, { type = '' } = {}) {
  const normalizedKeyword = normalizeDisplayTerm(keyword);
  if (!normalizedKeyword) {
    return {
      keyword: '',
      searchTerms: [],
      matchedGroups: [],
    };
  }

  const keywordComparable = normalizeComparableTerm(normalizedKeyword);
  const normalizedType = normalizeType(type);
  const groups = listSearchAliasGroupRecords({ enabled: true })
    .filter(item => !normalizedType || !item.type || item.type === normalizedType);

  const matchedGroups = groups
    .filter(group => shouldApplyGroup(keywordComparable, buildGroupTerms(group)));

  const searchTerms = [];
  const seen = new Set();
  const appendTerm = (term) => {
    const displayTerm = normalizeDisplayTerm(term);
    const comparable = normalizeComparableTerm(displayTerm);
    if (!displayTerm || !comparable || seen.has(comparable)) return;
    seen.add(comparable);
    searchTerms.push(displayTerm);
  };

  appendTerm(normalizedKeyword);
  matchedGroups.forEach(group => {
    buildGroupTerms(group).forEach(appendTerm);
  });

  return {
    keyword: normalizedKeyword,
    searchTerms,
    matchedGroups,
  };
}

function resolveSearchTerms(keyword, { type = '' } = {}) {
  return resolveSearchAliasContext(keyword, { type }).searchTerms;
}

function formatSearchAliasHints(context, { maxGroups = 3, maxTermsPerGroup = 6 } = {}) {
  const groups = Array.isArray(context?.matchedGroups) ? context.matchedGroups : [];
  if (groups.length === 0) return '';

  return groups
    .slice(0, maxGroups)
    .map((group) => {
      const terms = buildGroupTerms(group).slice(0, maxTermsPerGroup);
      return terms.join(' / ');
    })
    .filter(Boolean)
    .join('；');
}

export {
  listSearchAliasGroups,
  createSearchAliasGroup,
  updateSearchAliasGroup,
  deleteSearchAliasGroup,
  resolveSearchAliasContext,
  resolveSearchTerms,
  formatSearchAliasHints,
  normalizeComparableTerm,
};
