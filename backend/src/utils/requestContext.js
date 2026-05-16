import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';

function ensureRequestId(req, res, next) {
  const incoming = String(req.headers[REQUEST_ID_HEADER] || '').trim();
  const requestId = incoming || randomUUID();

  req.requestId = requestId;
  req.startedAtMs = Date.now();
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

function createRequestLogger({ logger = console } = {}) {
  return function requestLogger(req, res, next) {
    const startedAtMs = req.startedAtMs || Date.now();
    const { method, originalUrl, ip } = req;

    res.on('finish', () => {
      const durationMs = Date.now() - startedAtMs;
      const payload = {
        requestId: req.requestId || '',
        method,
        path: originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
        ip: ip || '',
      };
      logger.info?.(`[http] ${JSON.stringify(payload)}`);
    });

    next();
  };
}

export { REQUEST_ID_HEADER, ensureRequestId, createRequestLogger };
