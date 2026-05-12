import { fetchListByType } from './catalogService.js';
import { upsertContents } from '../repositories/contentRepository.js';
import { recordSourceRun } from '../repositories/sourceRepository.js';
import { createApiError } from '../utils/apiErrors.js';

const SOURCE_BY_TYPE = {
  drama: 'tvmaze',
  novel: 'openlibrary',
  comic: 'openlibrary',
  anime: 'jikan',
};

function sourceForType(type) {
  const source = SOURCE_BY_TYPE[type];
  if (!source) throw createApiError('invalid_request', 'Invalid content type');
  return source;
}

async function refreshContentType(type, { loader } = {}) {
  const source = sourceForType(type);
  const startedAt = new Date().toISOString();

  try {
    const result = await (loader
      ? loader()
      : fetchListByType({
        type,
        page: 1,
        limit: 30,
        sort: 'hot',
        __bypassCacheFallback: true,
      }));
    const list = Array.isArray(result?.list) ? result.list : [];
    const count = upsertContents(list);
    recordSourceRun({ type, source, status: 'success', count, error: null, startedAt });
    return { type, source, status: 'success', count };
  } catch (error) {
    recordSourceRun({
      type,
      source,
      status: 'failed',
      count: 0,
      error: error.message || '刷新失败',
      startedAt,
    });
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', error.message || '刷新失败');
  }
}

export { refreshContentType, sourceForType };
