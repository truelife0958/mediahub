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
