import express from 'express';
import { getSourceStatuses } from '../repositories/sourceRepository.js';
import { isDatabaseDisabled } from '../db/database.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ code: 0, data: isDatabaseDisabled() ? [] : getSourceStatuses() });
});

export default router;
