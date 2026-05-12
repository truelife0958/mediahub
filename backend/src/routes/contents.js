import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listContents, getContentById } from '../services/contentService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await listContents(req.query);
  res.json({ code: 0, data: result });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const data = await getContentById(req.params.id);
  res.json({ code: 0, data });
}));

export default router;
