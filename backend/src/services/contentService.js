import { listContents as listRemoteContents, getContentById as getRemoteContentById } from './catalogService.js';

export async function listContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '' }) {
  return listRemoteContents({ type, page, limit, sort, keyword });
}

export async function getContentById(id) {
  return getRemoteContentById(id);
}
