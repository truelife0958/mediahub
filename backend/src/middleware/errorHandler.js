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

export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 2001;
  const error = err.publicCode || (statusCode === 500 ? 'internal_error' : 'invalid_request');
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');
  res.status(statusCode).json({ code, error, message });
}
