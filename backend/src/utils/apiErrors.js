const ERROR_META = {
  invalid_request: { statusCode: 400, numericCode: 1001 },
  not_found: { statusCode: 404, numericCode: 1002 },
  unauthorized: { statusCode: 401, numericCode: 1004 },
  rate_limited: { statusCode: 429, numericCode: 1005 },
  content_parse_failed: { statusCode: 422, numericCode: 1401 },
  upstream_forbidden: { statusCode: 403, numericCode: 2004 },
  upstream_rate_limited: { statusCode: 429, numericCode: 2003 },
  upstream_unavailable: { statusCode: 502, numericCode: 2002 },
  upstream_timeout: { statusCode: 504, numericCode: 2005 },
  internal_error: { statusCode: 500, numericCode: 2001 },
};

function createApiError(publicCode, message, details = {}) {
  const meta = ERROR_META[publicCode] || ERROR_META.internal_error;
  const error = new Error(message || publicCode);
  error.statusCode = meta.statusCode;
  error.code = meta.numericCode;
  error.publicCode = publicCode in ERROR_META ? publicCode : 'internal_error';
  error.details = details;
  return error;
}

export { ERROR_META, createApiError };
