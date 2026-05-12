import express from 'express';
import { getSourceStatuses } from '../repositories/sourceRepository.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ code: 0, data: getSourceStatuses() });
});

export default router;
