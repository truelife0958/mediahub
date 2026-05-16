import express from 'express';
import { getSourceStatuses } from '../repositories/sourceRepository.js';
import { getSourceHealthSnapshot } from '../services/sourceStrategyService.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ code: 0, data: getSourceStatuses() });
});

router.get('/health', (req, res) => {
  const type = req.query.type ? String(req.query.type) : '';
  res.json({ code: 0, data: getSourceHealthSnapshot({ type }) });
});

export default router;
