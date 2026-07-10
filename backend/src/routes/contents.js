import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createApiError } from '../utils/apiErrors.js';
import { validateDiscoverQuery, validateKeyword, validateListQuery } from '../utils/requestValidation.js';
import {
  listContents,
  getContentById,
  discoverContents,
  getIpUniverse,
  getEntityProfile,
  explainSearchMatch,
} from '../services/contentService.js';
import { shapeContentResponse } from '../services/contentResponseService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  validateListQuery(req.query);
  const result = await listContents({
    ...req.query,
    searchMode: req.query.searchMode,
  });
  res.json({ code: 0, data: shapeContentResponse(result) });
}));

router.get('/discover/grouped', asyncHandler(async (req, res) => {
  validateDiscoverQuery(req.query);
  const data = await discoverContents(req.query || {});
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/universe/ip/:value', asyncHandler(async (req, res) => {
  const data = await getIpUniverse(decodeURIComponent(req.params.value));
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/entity/:field/:value', asyncHandler(async (req, res) => {
  const data = await getEntityProfile({
    field: req.params.field,
    value: decodeURIComponent(req.params.value),
  });
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/explain-match/:id', asyncHandler(async (req, res) => {
  validateKeyword(req.query.keyword);
  const content = await getContentById(req.params.id);
  const fields = explainSearchMatch(content, req.query.keyword);
  res.json({ code: 0, data: { id: req.params.id, keyword: String(req.query.keyword || ''), fields } });
}));

router.get('/compare', asyncHandler(async () => {
  throw createApiError('not_found', 'Not Found');
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const data = await getContentById(req.params.id);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

export default router;
