import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import contentRoutes from './routes/contents.js';
import recommendationRoutes from './routes/recommendations.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import sourceRoutes from './routes/sources.js';
import ingestionRoutes from './routes/ingestion.js';
import { initializeDatabase } from './db/database.js';

export function createApp() {
  initializeDatabase();

  const app = express();
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/contents', contentRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/sources', sourceRoutes);
  app.use('/api/ingestion', ingestionRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((_req, _res, next) => {
    const err = new Error('Not Found');
    err.statusCode = 404;
    err.code = 1003;
    next(err);
  });

  app.use(errorHandler);

  return app;
}
