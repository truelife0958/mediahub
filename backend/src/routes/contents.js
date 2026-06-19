import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listContents,
  getContentById,
  discoverContents,
  listTopicContents,
  getIpUniverse,
  getEntityProfile,
  compareContents,
  explainSearchMatch,
} from '../services/contentService.js';
import { shapeContentResponse } from '../services/contentResponseService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await listContents({
    ...req.query,
    searchMode: req.query.searchMode,
  });
  res.json({ code: 0, data: shapeContentResponse(result) });
}));

router.get('/discover/grouped', asyncHandler(async (req, res) => {
  const data = await discoverContents(req.query || {});
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/topics/:field/:value', asyncHandler(async (req, res) => {
  const data = await listTopicContents({
    field: req.params.field,
    value: decodeURIComponent(req.params.value),
    ...req.query,
  });
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

router.get('/compare', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(item => item.trim()).filter(Boolean);
  const data = await compareContents(ids);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

router.get('/explain-match/:id', asyncHandler(async (req, res) => {
  const content = await getContentById(req.params.id);
  const fields = explainSearchMatch(content, req.query.keyword);
  res.json({ code: 0, data: { id: req.params.id, keyword: String(req.query.keyword || ''), fields } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const data = await getContentById(req.params.id);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

export default router;
