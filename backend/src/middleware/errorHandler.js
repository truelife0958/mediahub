export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function statusToPublicCode(statusCode) {
  if (statusCode === 404) return 'not_found';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'upstream_forbidden';
  if (statusCode === 429) return 'upstream_rate_limited';
  if (statusCode === 504) return 'upstream_timeout';
  if (statusCode >= 500) return 'internal_error';
  return 'invalid_request';
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 2001;
  const error = err.publicCode || statusToPublicCode(statusCode);
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  const requestId = req?.requestId || '';
  const payload = {
    requestId,
    statusCode,
    code,
    error,
    message,
    stack: process.env.NODE_ENV !== 'production' && statusCode >= 500 ? String(err?.stack || '') : undefined,
  };
  console.error(`[error] ${JSON.stringify(payload)}`);

  res.status(statusCode).json({ code, error, message, requestId });
}
