import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTrendingContentsWithAi } from '../src/services/aiDiscoveryService.js';
import { rankContentsWithAi } from '../src/services/aiRankingService.js';
import { enrichPublicContent } from '../src/services/aiEnrichmentService.js';
import { resetDatabaseForTest } from '../src/db/database.js';

function withAiEnv(fn) {
  return async () => {
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

    const originalFetch = global.fetch;
    try {
      await fn();
    } finally {
      global.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

function chatResponse(content, init = {}) {
  return new Response(JSON.stringify({
    choices: [
      {
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

test('AI discovery uses OpenAI chat completions payload instead of Responses API', withAiEnv(async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(options.body || '{}')) });
    assert.match(String(url), /\/chat\/completions$/);
    assert.ok(Array.isArray(calls[0].body.messages));
    assert.equal('input' in calls[0].body, false);
    assert.equal('tools' in calls[0].body, false);
    return chatResponse({
      items: [
        {
          title: 'Chat Only Drama',
          summary: 'chat payload result',
          tags: ['drama'],
          actors: ['actor-a'],
          author: 'ai',
          ipName: 'chat-only',
          status: 'ongoing',
          hotScore: 6100,
          sourceUrl: 'https://example.com/chat-only',
        },
      ],
    });
  };

  const result = await searchTrendingContentsWithAi({ type: 'drama', limit: 5 });

  assert.equal(result.list[0].title, 'Chat Only Drama');
  assert.equal(result.total, 1);
  assert.equal(calls.length, 1);
}));

test('AI ranking reads JSON from chat completion message content', async () => {
  const pool = [
    { id: 'a', title: 'A', hotScore: 100 },
    { id: 'b', title: 'B', hotScore: 100 },
  ];
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(options.body || '{}')) });
    assert.match(String(url), /\/chat\/completions$/);
    assert.ok(Array.isArray(calls[0].body.messages));
    assert.equal('input' in calls[0].body, false);
    return chatResponse({ items: [{ id: 'b', reason: '更匹配', score: 91 }] });
  };

  try {
    const ranked = await rankContentsWithAi(pool, {
      enabled: true,
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      baseUrl: 'https://example.ai/v1',
    }, { type: 'drama' });

    assert.equal(ranked[0].id, 'b');
    assert.equal(ranked[0].reason, '更匹配');
    assert.equal(ranked[0].hotScore, 9100);
  } finally {
    global.fetch = originalFetch;
  }
});

test('AI enrichment uses chat completions and parses message content JSON', withAiEnv(async () => {
  global.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body || '{}'));
    assert.match(String(url), /\/chat\/completions$/);
    assert.ok(Array.isArray(body.messages));
    assert.equal('input' in body, false);
    return chatResponse({
      summary: 'Chat 摘要',
      tags: ['科幻'],
      actors: ['演员A'],
      author: 'AI 作者',
      ipName: 'Chat IP',
      status: 'completed',
      hotScore: 777,
    });
  };

  const result = await enrichPublicContent({
    title: 'Chat IP',
    text: '这是一部科幻冒险作品，讲述跨星系旅行和人物成长。'.repeat(10),
    type: 'novel',
    sourceUrl: 'https://example.com/chat-ip',
  });

  assert.equal(result.summary, 'Chat 摘要');
  assert.deepEqual(result.tags, ['科幻']);
  assert.equal(result.author, 'AI 作者');
  assert.equal(result.hotScore, 777);
}));
