/**
 * Test helpers for mocking AI chat completion requests.
 *
 * The production code uses `httpsRequest` (node:https) instead of `global.fetch`.
 * Tests must mock via `aiChatClient._setMockRequestFn` / `_clearMockRequestFn`.
 *
 * Usage:
 *   import { withMockAi, chatResponse } from './aiTestHelpers.js';
 *   test('my test', withMockAi(async () => { ... }));
 */

import { _setMockRequestFn, _clearMockRequestFn } from '../src/services/aiChatClient.js';

/**
 * Build a fake httpsRequest response that mimics the real return shape:
 *   { status, statusText, payload }
 */
export function chatResponse(content, init = {}) {
  return {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    payload: {
      choices: [
        {
          message: {
            role: 'assistant',
            content: typeof content === 'string' ? content : JSON.stringify(content),
          },
        },
      ],
    },
  };
}

/**
 * Create a mock httpsRequest function that records calls and returns
 * the provided response for any request to /chat/completions.
 */
export function createMockRequest(responseFn) {
  const calls = [];
  const mockFn = async ({ url, body, headers }) => {
    const parsedBody = JSON.parse(String(body || '{}'));
    calls.push({ url: String(url), body: parsedBody, headers });
    return responseFn({ url: String(url), body: parsedBody, headers });
  };
  mockFn.calls = calls;
  return mockFn;
}

/**
 * Wrap a test function with AI mock setup/teardown.
 * The mock intercepts all calls to httpsRequest and delegates to `responseFn`.
 * If `responseFn` is omitted, a default chatResponse with empty items is used.
 */
export function withAiMock(responseFn, fn) {
  if (!fn) {
    fn = responseFn;
    responseFn = () => chatResponse({ items: [] });
  }
  return async () => {
    const mock = createMockRequest(responseFn);
    _setMockRequestFn(mock);
    try {
      return await fn(mock);
    } finally {
      _clearMockRequestFn();
    }
  };
}

/**
 * Convenience: wrap a test with AI env vars + mock.
 * Sets AI config env vars, resets DB, installs mock, and cleans up after.
 */
export function withAiEnv(responseFn, fn) {
  if (!fn) {
    fn = responseFn;
    responseFn = () => chatResponse({ items: [] });
  }
  return async () => {
    const { resetDatabaseForTest } = await import('../src/db/database.js');
    const previous = {
      MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
      MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
      MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
      MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
      MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
    };

    resetDatabaseForTest(':memory:');

    process.env.MEDIAHUB_AI_ENABLED = 'true';
    process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
    process.env.MEDIAHUB_AI_BASE_URL = 'https://example.ai/v1';
    process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
    process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'true';

    const mock = createMockRequest(responseFn);
    _setMockRequestFn(mock);

    try {
      return await fn(mock);
    } finally {
      _clearMockRequestFn();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}
