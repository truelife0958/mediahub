import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTrendingContentsWithAi } from '../src/services/aiDiscoveryService.js';
import { rankContentsWithAi } from '../src/services/aiRankingService.js';
import { enrichPublicContent } from '../src/services/aiEnrichmentService.js';
import { resetDatabaseForTest } from '../src/db/database.js';
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

    try {
      return await fn();
    } finally {
      _clearMockRequestFn();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

test('AI discovery uses OpenAI chat completions payload instead of Responses API', withAiEnv(async () => {
  const calls = [];
  _setMockRequestFn(async ({ url, body }) => {
    calls.push({ url: String(url), body: JSON.parse(String(body || '{}')) });
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
  });

  const result = await searchTrendingContentsWithAi({ type: 'drama', limit: 5 });

  assert.equal(result.list[0].title, 'Chat Only Drama');
  assert.equal(result.total, 1);
  assert.equal(calls.length, 1);
}));

test('AI discovery preserves undisclosed playback or reading volume as zero', withAiEnv(async () => {
  _setMockRequestFn(async () => chatResponse({
    items: [
      {
        title: '未披露阅读量小说',
        summary: '公开资料未披露全网阅读量。',
        tags: ['小说'],
        actors: ['作者A'],
        author: '作者A',
        ipName: '未披露阅读量小说',
        status: 'completed',
        hotScore: 0,
        sourceUrl: 'https://example.com/undisclosed',
      },
    ],
  }));

  const result = await searchTrendingContentsWithAi({ type: 'novel', limit: 1 });

  assert.equal(result.list[0].hotScore, 0);
}));

test('AI discovery prompt requires China volume metrics instead of heat scores', withAiEnv(async () => {
  _setMockRequestFn(async ({ body }) => {
    const parsed = JSON.parse(String(body || '{}'));
    const prompt = parsed.messages.map(message => message.content).join('\n');
    assert.match(prompt, /中国大陆原创内容/);
    assert.match(prompt, /hotScore/);
    assert.match(prompt, /扩展词/);
    assert.match(prompt, /别名/);
    return chatResponse({
      items: [
        {
          title: '短剧样例',
          summary: '中国短剧样例。',
          tags: ['短剧'],
          actors: [],
          author: '平台',
          ipName: '短剧样例',
          status: 'completed',
          hotScore: 10000,
          sourceUrl: 'https://example.com/short',
        },
      ],
    });
  });

  await searchTrendingContentsWithAi({
    type: 'drama',
    limit: 1,
    keyword: '盛夏芬德拉',
    searchTerms: ['盛夏芬德拉', '家里家外'],
    aliasHints: '家里家外 / 盛夏芬德拉',
  });
}));

test('AI discovery filters out long-drama items for drama type', withAiEnv(async () => {
  _setMockRequestFn(async () => chatResponse({
    items: [
      {
        title: '某某都市长剧',
        summary: '高热度电视剧作品。',
        tags: ['电视剧', '都市'],
        actors: ['演员甲'],
        author: '平台',
        ipName: '某某都市长剧',
        status: 'ongoing',
        hotScore: 123456,
        sourceUrl: 'https://example.com/long-drama',
      },
      {
        title: '某某都市短剧',
        summary: '竖屏短剧热播中。',
        tags: ['短剧', '都市'],
        actors: ['演员乙'],
        author: '平台',
        ipName: '某某都市短剧',
        status: 'ongoing',
        hotScore: 654321,
        sourceUrl: 'https://example.com/short-drama',
      },
    ],
  }));

  const result = await searchTrendingContentsWithAi({ type: 'drama', limit: 10 });

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, '某某都市短剧');
}));

test('AI ranking reads JSON from chat completion message content', async () => {
  const calls = [];
  _setMockRequestFn(async ({ url, body }) => {
    calls.push({ url: String(url), body: JSON.parse(String(body || '{}')) });
    assert.match(String(url), /\/chat\/completions$/);
    assert.ok(Array.isArray(calls[0].body.messages));
    assert.equal('input' in calls[0].body, false);
    return chatResponse({ items: [{ id: 'b', reason: '更匹配', score: 91 }] });
  });

  try {
    const pool = [
      { id: 'a', title: 'A', hotScore: 100 },
      { id: 'b', title: 'B', hotScore: 100 },
    ];
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
    _clearMockRequestFn();
  }
});

test('AI enrichment uses chat completions and parses message content JSON', withAiEnv(async () => {
  _setMockRequestFn(async ({ url, body }) => {
    const parsed = JSON.parse(String(body || '{}'));
    assert.match(String(url), /\/chat\/completions$/);
    assert.ok(Array.isArray(parsed.messages));
    assert.equal('input' in parsed, false);
    return chatResponse({
      summary: 'Chat 摘要',
      tags: ['科幻'],
      actors: ['演员A'],
      author: 'AI 作者',
      ipName: 'Chat IP',
      status: 'completed',
      hotScore: 777,
    });
  });

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
