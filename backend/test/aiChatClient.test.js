import test from 'node:test';
import assert from 'node:assert/strict';
import { postAiChatCompletion, _setMockRequestFn, _clearMockRequestFn } from '../src/services/aiChatClient.js';

test('postAiChatCompletion aborts slow model gateway requests with a clear timeout error', async () => {
  // Mock httpsRequest that never resolves (simulates a slow gateway).
  // The AbortController inside postAiChatCompletion will fire after timeoutMs.
  _setMockRequestFn(async ({ signal }) => {
    return new Promise((_resolve, reject) => {
      const onAbort = () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        reject(error);
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
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
      /AI 模型请求超时|AI 模型响应超时/
    );
  } finally {
    _clearMockRequestFn();
  }
});
