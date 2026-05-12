import { createApiError } from '../utils/apiErrors.js';

const DEFAULT_TIMEOUT_MS = Math.max(2000, Number(process.env.UPSTREAM_TIMEOUT_MS || 10000));

function createHeaders(extraHeaders = {}) {
  return {
    'User-Agent': process.env.UPSTREAM_USER_AGENT || 'MediaHub/1.0 (+https://example.local)',
    Accept: 'application/json',
    ...extraHeaders,
  };
}

export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(headers),
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw createApiError('upstream_rate_limited', '上游内容服务请求过于频繁', { url });
    }

    if (!response.ok) {
      throw createApiError('upstream_unavailable', `上游内容服务不可用: ${response.status}`, { url, status: response.status });
    }

    return await response.json();
  } catch (error) {
    if (error.publicCode) throw error;
    if (error.name === 'AbortError') {
      throw createApiError('upstream_unavailable', '上游内容服务请求超时', { url });
    }
    throw createApiError('upstream_unavailable', error.message || '上游内容服务不可用', { url });
  } finally {
    clearTimeout(timer);
  }
}
