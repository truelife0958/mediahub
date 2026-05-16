import { createApiError } from '../utils/apiErrors.js';
import { parsePositiveInt, buildExponentialBackoffDelayMs, sleep } from '../utils/retryTools.js';

const DEFAULT_TIMEOUT_MS = Math.max(2000, Number(process.env.UPSTREAM_TIMEOUT_MS || 10000));
const DEFAULT_RETRY_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 5000;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_OPEN_MS = 30_000;
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const RATE_LIMIT_BUCKETS = new Map();
const CIRCUIT_BREAKERS = new Map();

function createHeaders(extraHeaders = {}) {
  return {
    'User-Agent': process.env.UPSTREAM_USER_AGENT || 'MediaHub/1.0 (+https://example.local)',
    Accept: 'application/json',
    ...extraHeaders,
  };
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function isRetryableNetworkError(error) {
  if (!error || typeof error !== 'object') return false;
  const code = error.code || error.cause?.code;
  if (typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code)) return true;
  if (error.name !== 'TypeError') return false;
  const message = String(error.message || '').toLowerCase();
  return message.includes('fetch failed') || message.includes('network') || message.includes('socket') || message.includes('timeout');
}

function parseRetryAfterMs(value) {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1000));
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()));
}

function buildRetryDelayMs({ attempt, baseDelayMs, retryAfterHeader }) {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null) return retryAfterMs;
  return buildExponentialBackoffDelayMs({ attempt, baseDelayMs, maxDelayMs: MAX_RETRY_DELAY_MS });
}

function readRetryPolicy(overrideMaxAttempts, overrideBaseDelayMs) {
  const envMaxAttempts = parsePositiveInt(
    process.env.UPSTREAM_RETRY_MAX_ATTEMPTS,
    DEFAULT_RETRY_MAX_ATTEMPTS,
    1,
    MAX_RETRY_ATTEMPTS
  );
  const envBaseDelayMs = parsePositiveInt(
    process.env.UPSTREAM_RETRY_BASE_DELAY_MS,
    DEFAULT_RETRY_BASE_DELAY_MS,
    0,
    MAX_RETRY_DELAY_MS
  );
  return {
    maxAttempts: parsePositiveInt(overrideMaxAttempts, envMaxAttempts, 1, MAX_RETRY_ATTEMPTS),
    baseDelayMs: parsePositiveInt(overrideBaseDelayMs, envBaseDelayMs, 0, MAX_RETRY_DELAY_MS),
  };
}

function bucketKey(url) {
  const value = String(url || 'unknown');
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return value;
  }
}

function readRateLimitPolicy(override) {
  const perSecond = parsePositiveInt(
    override?.perSecond,
    parsePositiveInt(process.env.UPSTREAM_RATE_LIMIT_PER_SECOND, 6, 1, 100),
    1,
    100,
  );
  const burst = parsePositiveInt(
    override?.burst,
    parsePositiveInt(process.env.UPSTREAM_RATE_LIMIT_BURST, perSecond, 1, 200),
    1,
    200,
  );
  return { perSecond, burst };
}

function takeRateLimitToken(key, policy) {
  const now = Date.now();
  const bucket = RATE_LIMIT_BUCKETS.get(key) || {
    tokens: policy.burst,
    updatedAtMs: now,
  };

  const elapsedSeconds = Math.max(0, (now - bucket.updatedAtMs) / 1000);
  const refill = elapsedSeconds * policy.perSecond;
  bucket.tokens = Math.min(policy.burst, bucket.tokens + refill);
  bucket.updatedAtMs = now;

  if (bucket.tokens < 1) {
    RATE_LIMIT_BUCKETS.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  RATE_LIMIT_BUCKETS.set(key, bucket);
  return true;
}

function readCircuitBreakerPolicy(override) {
  return {
    failureThreshold: parsePositiveInt(
      override?.failureThreshold,
      parsePositiveInt(process.env.UPSTREAM_CIRCUIT_BREAKER_FAILURE_THRESHOLD, DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD, 1, 50),
      1,
      50,
    ),
    openMs: parsePositiveInt(
      override?.openMs,
      parsePositiveInt(process.env.UPSTREAM_CIRCUIT_BREAKER_OPEN_MS, DEFAULT_CIRCUIT_BREAKER_OPEN_MS, 1_000, 300_000),
      1_000,
      300_000,
    ),
  };
}

function canPassCircuitBreaker(key) {
  const state = CIRCUIT_BREAKERS.get(key);
  if (!state) return true;

  // openUntilMs=0 表示尚未打开熔断，仅累计失败次数。
  if (!state.openUntilMs || state.openUntilMs <= 0) return true;

  if (state.openUntilMs <= Date.now()) {
    CIRCUIT_BREAKERS.delete(key);
    return true;
  }
  return false;
}

function markCircuitBreakerFailure(key, policy) {
  const current = CIRCUIT_BREAKERS.get(key) || {
    failures: 0,
    openUntilMs: 0,
  };
  current.failures += 1;
  if (current.failures >= policy.failureThreshold) {
    current.openUntilMs = Date.now() + policy.openMs;
  }
  CIRCUIT_BREAKERS.set(key, current);
}

function markCircuitBreakerSuccess(key) {
  CIRCUIT_BREAKERS.delete(key);
}

function resetHttpServiceRuntimeState() {
  RATE_LIMIT_BUCKETS.clear();
  CIRCUIT_BREAKERS.clear();
}

export async function fetchJson(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  retryMaxAttempts,
  retryBaseDelayMs,
  rateLimit,
  circuitBreaker,
} = {}) {
  const { maxAttempts, baseDelayMs } = readRetryPolicy(retryMaxAttempts, retryBaseDelayMs);
  const rateLimitPolicy = readRateLimitPolicy(rateLimit);
  const circuitBreakerPolicy = readCircuitBreakerPolicy(circuitBreaker);
  const key = bucketKey(url);

  if (!canPassCircuitBreaker(key)) {
    throw createApiError('upstream_unavailable', '上游内容服务熔断中，请稍后重试', {
      url,
      reason: 'circuit_open',
    });
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!takeRateLimitToken(key, rateLimitPolicy)) {
      await sleep(120);
      attempt -= 1;
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: createHeaders(headers),
        signal: controller.signal,
      });

      if (response.status === 429) {
        if (attempt < maxAttempts) {
          const delay = buildRetryDelayMs({
            attempt,
            baseDelayMs,
            retryAfterHeader: response.headers.get('retry-after'),
          });
          await sleep(delay);
          continue;
        }
        markCircuitBreakerFailure(key, circuitBreakerPolicy);
        throw createApiError('upstream_rate_limited', '上游内容服务请求过于频繁', {
          url,
          status: response.status,
          attempts: attempt,
        });
      }

      if (response.status >= 500 && attempt < maxAttempts) {
        await sleep(buildRetryDelayMs({ attempt, baseDelayMs, retryAfterHeader: null }));
        continue;
      }

      if (!response.ok) {
        markCircuitBreakerFailure(key, circuitBreakerPolicy);
        throw createApiError('upstream_unavailable', `上游内容服务不可用: ${response.status}`, {
          url,
          status: response.status,
          attempts: attempt,
        });
      }

      const data = await response.json();
      markCircuitBreakerSuccess(key);
      return data;
    } catch (error) {
      if (error.publicCode) throw error;

      if ((isAbortError(error) || isRetryableNetworkError(error)) && attempt < maxAttempts) {
        await sleep(buildRetryDelayMs({ attempt, baseDelayMs, retryAfterHeader: null }));
        continue;
      }

      if (isAbortError(error)) {
        markCircuitBreakerFailure(key, circuitBreakerPolicy);
        throw createApiError('upstream_unavailable', '上游内容服务请求超时', { url, attempts: attempt });
      }

      markCircuitBreakerFailure(key, circuitBreakerPolicy);
      throw createApiError('upstream_unavailable', error.message || '上游内容服务不可用', { url, attempts: attempt });
    } finally {
      clearTimeout(timer);
    }
  }

  markCircuitBreakerFailure(key, circuitBreakerPolicy);
  throw createApiError('upstream_unavailable', '上游内容服务不可用', { url, attempts: maxAttempts });
}

export { resetHttpServiceRuntimeState };
