import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import contentRoutes from './routes/contents.js';
import adminRoutes from './routes/admin.js';
import categoryRoutes from './routes/categories.js';
import sourceRoutes from './routes/sources.js';
import ingestionRoutes from './routes/ingestion.js';
import systemRoutes from './routes/system.js';
import { initializeDatabase } from './db/database.js';
import { ensureRequestId, createRequestLogger } from './utils/requestContext.js';
import { createApiError } from './utils/apiErrors.js';
import { requireAdmin } from './middleware/adminAuth.js';
import { assertProductionConfig, isProductionRuntime } from './utils/productionConfig.js';


function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function buildAllowedOrigins(frontendBaseUrl) {
  const origins = new Set([normalizeOrigin(frontendBaseUrl)].filter(Boolean));
  if (!isProductionRuntime()) {
    for (const origin of [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5174',
      'http://localhost:5174',
    ]) origins.add(origin);
  }
  return origins;
}

function createAdminPostGuard(allowedOrigins) {
  return (req, _res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
    if (!/^\/api\/(admin|ingestion|system|sources)(?:\/|$)/.test(req.path || req.originalUrl || '')) return next();

    const origin = normalizeOrigin(req.headers.origin || '');
    const hasTrustedHeader = String(req.headers['x-mediahub-admin-action'] || '').trim() === 'true';
    if (!origin || !allowedOrigins.has(origin) || !hasTrustedHeader) {
      return next(createApiError('unauthorized', 'Admin request origin verification failed'));
    }
    return next();
  };
}

export function createApp() {
  assertProductionConfig();
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

  const allowedOrigins = buildAllowedOrigins(frontendBaseUrl);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      return callback(null, allowedOrigins.has(normalized));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(createAdminPostGuard(allowedOrigins));

  app.use('/api/contents', contentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/sources', requireAdmin, sourceRoutes);
  app.use('/api/ingestion', requireAdmin, ingestionRoutes);
  app.use('/api/system', requireAdmin, systemRoutes);

  app.get('/', (_req, res) => {
    res.json({
      code: 0,
      data: {
        service: 'MediaHub API',
        status: 'ok',
        message: 'MediaHub backend API service. Visit the frontend URL to browse.',
        frontend: frontendPublicUrl,
        health: '/api/health',
      },
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get(/^\/admin(?:\/.*)?$/, (req, res) => {
    try {
      const target = new URL(req.originalUrl || '/admin', frontendBaseUrl);
      if (target.origin !== new URL(frontendBaseUrl).origin) {
        return res.redirect(frontendPublicUrl);
      }
      res.redirect(target.toString());
    } catch {
      res.redirect(frontendPublicUrl);
    }
  });

  app.use((_req, _res, next) => {
    next(createApiError('not_found', 'Not Found'));
  });

  app.use(errorHandler);

  return app;
}


