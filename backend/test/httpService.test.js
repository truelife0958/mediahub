import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, resetHttpServiceRuntimeState } from '../src/services/httpService.js';

function createJsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

test('fetchJson retries timeout once then succeeds', async () => {
  resetHttpServiceRuntimeState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async (_url, { signal }) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    assert.ok(signal);
    return createJsonResponse({ ok: true }, 200);
  };

  try {
    const data = await fetchJson('https://example.com/test');
    assert.deepEqual(data, { ok: true });
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchJson throws upstream_unavailable after exhausting timeout retries', async () => {
  resetHttpServiceRuntimeState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  try {
    await assert.rejects(
      () => fetchJson('https://example.com/timeout', { retryMaxAttempts: 2 }),
      (error) => {
        assert.equal(error.publicCode, 'upstream_unavailable');
        assert.match(error.message, /上游内容服务请求超时/);
        return true;
      }
    );
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchJson retries once on 429 then succeeds', async () => {
  resetHttpServiceRuntimeState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return createJsonResponse({ message: 'rate limited' }, 429, { 'Retry-After': '0' });
    }
    return createJsonResponse({ ok: true }, 200);
  };

  try {
    const data = await fetchJson('https://example.com/rate-limit');
    assert.deepEqual(data, { ok: true });
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchJson does not retry non-retryable upstream status', async () => {
  resetHttpServiceRuntimeState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return createJsonResponse({ message: 'not found' }, 404);
  };

  try {
    await assert.rejects(
      () => fetchJson('https://example.com/not-found'),
      (error) => {
        assert.equal(error.publicCode, 'upstream_unavailable');
        assert.match(error.message, /404/);
        return true;
      }
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchJson opens circuit breaker after repeated failures', async () => {
  resetHttpServiceRuntimeState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    throw new Error('network down');
  };

  try {
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => fetchJson('https://cb.example.com/fail', {
        retryMaxAttempts: 1,
        circuitBreaker: { failureThreshold: 5, openMs: 60_000 },
      }));
    }

    // 触发熔断打开。
    await assert.rejects(() => fetchJson('https://cb.example.com/fail', {
      retryMaxAttempts: 1,
      circuitBreaker: { failureThreshold: 5, openMs: 60_000 },
    }));

    await assert.rejects(
      () => fetchJson('https://cb.example.com/fail', {
        retryMaxAttempts: 1,
        circuitBreaker: { failureThreshold: 5, openMs: 60_000 },
      }),
      (error) => {
        assert.equal(error.publicCode, 'upstream_unavailable');
        assert.match(error.message, /熔断/);
        return true;
      }
    );

    // 熔断打开后不应再继续发起真实请求。
    assert.equal(calls, 5);
  } finally {
    global.fetch = originalFetch;
  }
});
