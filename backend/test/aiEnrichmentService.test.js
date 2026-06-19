import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichPublicContent } from '../src/services/aiEnrichmentService.js';
import { _setMockRequestFn, _clearMockRequestFn } from '../src/services/aiChatClient.js';

function chatResponse(content, init = {}) {
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

test('enrichPublicContent extracts simple tags and summary from public text', async () => {
  const result = await enrichPublicContent({
    title: '星际赏金猎人',
    text: '这是一部科幻 动作 动漫，讲述赏金猎人在宇宙中的冒险。'.repeat(8),
    type: 'anime',
    sourceUrl: 'https://example.com/public-page',
  });

  assert.equal(result.title, '星际赏金猎人');
  assert.equal(result.type, 'anime');
  assert.ok(result.summary.length > 10);
  assert.ok(result.tags.length > 0);
});

test('enrichPublicContent rejects empty public text', async () => {
  await assert.rejects(
    () => enrichPublicContent({ title: 'Empty', text: '', type: 'novel', sourceUrl: 'https://example.com/empty' }),
    /公开页面文本不足/
  );
});

test('enrichPublicContent accepts AI JSON output when model gateway returns structured data', async () => {
  const prevEnabled = process.env.MEDIAHUB_AI_ENABLED;
  const prevModel = process.env.MEDIAHUB_AI_MODEL;
  const prevBaseUrl = process.env.MEDIAHUB_AI_BASE_URL;
  const prevApiKey = process.env.MEDIAHUB_AI_API_KEY;

  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.ai/v1';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';

  _setMockRequestFn(async ({ url }) => {
    if (String(url).includes('/chat/completions')) {
      return chatResponse({
        summary: 'AI摘要',
        tags: ['玄幻', '热血'],
        actors: ['配音A'],
        author: 'AI作者',
        ipName: '星际计划',
        status: 'ongoing',
        hotScore: 888,
      });
    }
    throw new Error('unexpected request');
  });

  try {
    const result = await enrichPublicContent({
      title: '星际计划',
      text: '这是一部长篇玄幻冒险故事。'.repeat(20),
      type: 'novel',
      sourceUrl: 'https://example.com/public',
      base: {
        source: { provider: 'fanqie', label: '番茄小说', url: 'https://example.com/public' },
      },
    });

    assert.equal(result.summary, 'AI摘要');
    assert.deepEqual(result.tags.slice(0, 2), ['玄幻', '热血']);
    assert.equal(result.author, 'AI作者');
    assert.equal(result.status, 'ongoing');
    assert.equal(result.hotScore, 888);
  } finally {
    _clearMockRequestFn();
    if (prevEnabled === undefined) delete process.env.MEDIAHUB_AI_ENABLED;
    else process.env.MEDIAHUB_AI_ENABLED = prevEnabled;
    if (prevModel === undefined) delete process.env.MEDIAHUB_AI_MODEL;
    else process.env.MEDIAHUB_AI_MODEL = prevModel;
    if (prevBaseUrl === undefined) delete process.env.MEDIAHUB_AI_BASE_URL;
    else process.env.MEDIAHUB_AI_BASE_URL = prevBaseUrl;
    if (prevApiKey === undefined) delete process.env.MEDIAHUB_AI_API_KEY;
    else process.env.MEDIAHUB_AI_API_KEY = prevApiKey;
  }
});
