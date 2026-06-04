import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listContents, getContentById, discoverContents, listTopicContents } from '../services/contentService.js';
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

router.get('/:id', asyncHandler(async (req, res) => {
  const data = await getContentById(req.params.id);
  res.json({ code: 0, data: shapeContentResponse(data) });
}));

export default router;
