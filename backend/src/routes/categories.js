import express from 'express';
import { categories } from '../utils/store.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ code: 0, data: categories });
});

export default router;
