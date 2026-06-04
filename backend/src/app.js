import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import contentRoutes from './routes/contents.js';
import recommendationRoutes from './routes/recommendations.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import categoryRoutes from './routes/categories.js';
import sourceRoutes from './routes/sources.js';
import ingestionRoutes from './routes/ingestion.js';
import systemRoutes from './routes/system.js';
import leaderboardRoutes from './routes/leaderboards.js';
import { initializeDatabase } from './db/database.js';
import { ensureRequestId, createRequestLogger } from './utils/requestContext.js';
import { createApiError } from './utils/apiErrors.js';
import { requireAdmin } from './middleware/adminAuth.js';

export function createApp() {
  initializeDatabase();

  const app = express();
  const frontendBaseUrl = process.env.MEDIAHUB_FRONTEND_URL || 'http://127.0.0.1:5174';
  const frontendPublicUrl = (() => {
    try {
      return new URL(frontendBaseUrl).toString().replace(/\/?$/, '/');
    } catch {
      return 'http://127.0.0.1:5174/';
    }
  })();

  app.use(ensureRequestId);
  app.use(createRequestLogger());

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/contents', contentRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/sources', requireAdmin, sourceRoutes);
  app.use('/api/ingestion', requireAdmin, ingestionRoutes);
  app.use('/api/system', requireAdmin, systemRoutes);
  app.use('/api/leaderboards', leaderboardRoutes);

  app.get('/', (_req, res) => {
    res.json({
      code: 0,
      data: {
        service: 'MediaHub API',
        status: 'ok',
        message: '这是后端 API 服务，请访问前端页面进行浏览。',
        frontend: frontendPublicUrl,
        health: '/api/health',
      },
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get(['/admin', '/admin/*'], (req, res) => {
    const target = new URL(req.originalUrl || '/admin', frontendBaseUrl).toString();
    res.redirect(target);
  });

  app.use((_req, _res, next) => {
    next(createApiError('not_found', 'Not Found'));
  });

  app.use(errorHandler);

  return app;
}
