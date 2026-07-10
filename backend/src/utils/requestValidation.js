import { createApiError } from './apiErrors.js';

const CONTENT_TYPES = new Set(['drama', 'novel', 'anime', 'comic']);
const MAX_KEYWORD_LENGTH = 80;
const MAX_QUERY_PAGE = 1000;
const MAX_QUERY_LIMIT = 50;

function firstQueryValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

function validateContentType(value, { required = true, field = 'type' } = {}) {
  const raw = firstQueryValue(value);
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw createApiError('invalid_request', 'Invalid content type');
    return '';
  }
  if (!CONTENT_TYPES.has(normalized)) {
    throw createApiError('invalid_request', 'Invalid content type');
  }
  return normalized;
}

function validateKeyword(value, { field = 'keyword', maxLength = MAX_KEYWORD_LENGTH, required = false } = {}) {
  const raw = firstQueryValue(value);
  const normalized = String(raw || '').trim();
  if (!normalized) {
    if (required) throw createApiError('invalid_request', `${field} is required`);
    return '';
  }
  if (normalized.length > maxLength) {
    throw createApiError('invalid_request', `${field} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function validatePositiveIntegerParam(value, { field, max, required = false } = {}) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw createApiError('invalid_request', `${field} is required`);
    return undefined;
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw createApiError('invalid_request', `${field} must be a positive integer`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max && parsed > max)) {
    throw createApiError('invalid_request', `${field} must be between 1 and ${max || Number.MAX_SAFE_INTEGER}`);
  }
  return parsed;
}

function validateEnumParam(value, { field, allowed, required = false } = {}) {
  const raw = firstQueryValue(value);
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw createApiError('invalid_request', `${field} is required`);
    return '';
  }
  if (!allowed.includes(normalized)) {
    throw createApiError('invalid_request', `Invalid ${field}`);
  }
  return normalized;
}

function validateListQuery(query = {}) {
  validateContentType(query.type, { required: true });
  validateKeyword(query.keyword);
  validatePositiveIntegerParam(query.page, { field: 'page', max: MAX_QUERY_PAGE });
  validatePositiveIntegerParam(query.limit, { field: 'limit', max: MAX_QUERY_LIMIT });
  validateEnumParam(query.sort, { field: 'sort', allowed: ['hot', 'latest'] });
  validateEnumParam(query.searchMode, { field: 'searchMode', allowed: ['hybrid', 'local'] });
}

function validateDiscoverQuery(query = {}) {
  validateKeyword(query.keyword);
  validatePositiveIntegerParam(query.page, { field: 'page', max: MAX_QUERY_PAGE });
  validatePositiveIntegerParam(query.limit, { field: 'limit', max: MAX_QUERY_LIMIT });
  validateEnumParam(query.sort, { field: 'sort', allowed: ['hot', 'latest'] });
  validateEnumParam(query.searchMode, { field: 'searchMode', allowed: ['hybrid', 'local'] });
}

export {
  CONTENT_TYPES,
  MAX_KEYWORD_LENGTH,
  MAX_QUERY_PAGE,
  MAX_QUERY_LIMIT,
  validateContentType,
  validateKeyword,
  validatePositiveIntegerParam,
  validateEnumParam,
  validateListQuery,
  validateDiscoverQuery,
};
