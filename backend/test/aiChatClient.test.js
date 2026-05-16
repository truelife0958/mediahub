import test from 'node:test';
import assert from 'node:assert/strict';
import { postAiChatCompletion } from '../src/services/aiChatClient.js';

test('postAiChatCompletion aborts slow model gateway requests with a clear timeout error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

  try {
    await assert.rejects(
      () => postAiChatCompletion({
        config: {
          baseUrl: 'https://example.ai/v1',
          apiKey: 'sk-test',
          model: 'gpt-5-mini',
        },
        prompt: '返回 JSON',
        timeoutMs: 20,
      }),
      /AI 模型请求超时/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
