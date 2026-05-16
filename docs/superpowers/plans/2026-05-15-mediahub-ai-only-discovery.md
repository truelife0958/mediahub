# MediaHub AI-only Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all dedicated platform API acquisition with AI search discovery plus optional public-page text extraction, while returning no image fields and keeping startup/daily refresh.

**Architecture:** Keep the existing Express + SQLite + React architecture. Replace platform-specific catalog branches with a single `ai_search` source, add a small public-page text extractor used by AI discovery, default content response shaping to omit `cover`, and simplify the admin source-routing UI to AI-only status.

**Tech Stack:** Node.js ESM, Express, Node built-in `fetch`, SQLite via `node:sqlite`, React + TypeScript + Vite, `node:test`.

---

## File Structure

- Modify `backend/src/services/aiDiscoveryService.js`: remove `cover` from AI prompt/schema, add optional public-page extraction enrichment, export testable helpers.
- Create `backend/src/services/publicPageTextService.js`: fetch and sanitize public HTML/text with strict URL, timeout and size limits.
- Modify `backend/src/services/ingestionService.js`: make every content type use `ai_search`; keep backfill, cursor and run recording.
- Modify `backend/src/services/catalogService.js`: remove TVMaze/OpenLibrary/Jikan fetch/list/detail branches; route live fetches only to AI search; details are cache-first only.
- Modify `backend/src/services/sourceStrategyService.js`: support only `ai_search` per content type while keeping API compatibility.
- Modify `backend/src/services/contentResponseService.js`: omit `cover` by default for all content payloads.
- Create `backend/test/aiDiscoveryService.test.js`: add AI prompt, no-cover and public-page extraction tests.
- Modify `backend/test/ingestionService.test.js`: update source/cursor expectations from platform sources to `ai_search`.
- Modify `backend/test/httpRoutes.test.js`: update contracts for no-cover default, AI-only source routing and no platform fallback.
- Modify `backend/test/contracts/apiContract.test.js`: assert source routing exposes only `ai_search`.
- Modify `frontend/src/pages/Admin.tsx`: remove source-routing mutation state/handlers and render status-only source health.
- Modify `frontend/src/pages/admin/SourceRoutingSection.tsx`: convert to AI source status panel with no route switching buttons.
- Modify `frontend/src/pages/admin/SystemSettingsCard.tsx`: replace per-type route chains with AI-only acquisition summary.
- Modify `frontend/src/types/index.ts`: keep API compatibility but clarify source routing stays `ai_search`; no schema removal.
- Modify `README.md`: document AI-only data acquisition, public-page extraction, no image response and required AI config.

## Task 1: AI Discovery Prompt and Public Page Text

**Files:**
- Create: `backend/src/services/publicPageTextService.js`
- Modify: `backend/src/services/aiDiscoveryService.js`
- Test: `backend/test/aiDiscoveryService.test.js`

- [ ] **Step 1: Create failing tests for AI prompt and no cover**

Create `backend/test/aiDiscoveryService.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, searchTrendingContentsWithAi } from '../src/services/aiDiscoveryService.js';
import { fetchPublicPageText } from '../src/services/publicPageTextService.js';

test('AI discovery prompt does not request cover or image fields', () => {
  const prompt = buildPrompt({
    type: 'anime',
    keyword: '科幻',
    page: 1,
    limit: 5,
    sort: 'hot',
  });

  assert.doesNotMatch(prompt, /\bcover\b/i);
  assert.doesNotMatch(prompt, /\bimage\b/i);
  assert.match(prompt, /sourceUrl/);
  assert.match(prompt, /严格返回 JSON/);
});

test('AI discovery maps model output without returning cover from upstream data', async () => {
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
    MEDIAHUB_AI_DISCOVERY_PUBLIC_PAGE_ENABLED: process.env.MEDIAHUB_AI_DISCOVERY_PUBLIC_PAGE_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.ai/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';
  process.env.MEDIAHUB_AI_DISCOVERY_PUBLIC_PAGE_ENABLED = 'false';

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /example\.ai\/v1\/responses$/);
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        items: [{
          title: '无图热门动漫',
          summary: '由 AI 搜索发现的热门动漫。',
          tags: ['科幻'],
          actors: ['Studio A'],
          author: 'AI',
          ipName: '无图热门动漫',
          status: 'ongoing',
          hotScore: 5000,
          sourceUrl: 'https://example.com/anime',
          cover: 'https://example.com/should-not-leak.jpg',
          image: 'https://example.com/should-not-leak-2.jpg',
        }],
      }),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await searchTrendingContentsWithAi({ type: 'anime', limit: 5 });
    assert.equal(result.list.length, 1);
    assert.equal(result.list[0].title, '无图热门动漫');
    assert.equal(result.list[0].source.provider, 'ai_search');
    assert.equal(result.list[0].cover, '');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```

- [ ] **Step 2: Add failing tests for public page extraction**

Append to `backend/test/aiDiscoveryService.test.js`:

```js
test('fetchPublicPageText accepts public HTTP pages and strips scripts/styles/html', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(String(url), 'https://example.com/public');
    return new Response(`
      <html>
        <head><title>公开页面标题</title><style>.x{color:red}</style></head>
        <body><script>window.secret = true</script><main>这是一段公开网页正文，用于 AI 结构化。</main></body>
      </html>
    `, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };

  try {
    const text = await fetchPublicPageText('https://example.com/public', {
      timeoutMs: 1000,
      maxBytes: 20000,
      maxTextLength: 2000,
    });
    assert.match(text, /公开页面标题/);
    assert.match(text, /公开网页正文/);
    assert.doesNotMatch(text, /window\.secret/);
    assert.doesNotMatch(text, /color:red/);
    assert.doesNotMatch(text, /<main>/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchPublicPageText rejects non-http URLs without fetching', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('unexpected fetch');
  };

  try {
    await assert.rejects(() => fetchPublicPageText('file:///etc/passwd'), /只支持公开 HTTP/);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm run test --workspace=backend -- test/aiDiscoveryService.test.js
```

Expected: FAIL because `buildPrompt` is not exported and `publicPageTextService.js` is missing.

- [ ] **Step 4: Implement public page text service**

Create `backend/src/services/publicPageTextService.js`:

```js
import { createApiError } from '../utils/apiErrors.js';

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_BYTES = 256_000;
const DEFAULT_MAX_TEXT_LENGTH = 12_000;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function isPublicPageFetchEnabled() {
  return parseBoolean(process.env.MEDIAHUB_AI_DISCOVERY_PUBLIC_PAGE_ENABLED, true);
}

function normalizePublicUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw createApiError('invalid_request', '公开页面 URL 无效');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw createApiError('invalid_request', '只支持公开 HTTP/HTTPS 页面');
  }
  return url.toString();
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function readResponseTextWithLimit(response, maxBytes) {
  const text = await response.text();
  const buffer = Buffer.from(text);
  if (buffer.byteLength <= maxBytes) return text;
  return buffer.subarray(0, maxBytes).toString('utf8');
}

async function fetchPublicPageText(urlInput, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
} = {}) {
  const url = normalizePublicUrl(urlInput);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html, text/plain;q=0.9, */*;q=0.1',
        'User-Agent': 'MediaHub-AI-Discovery/1.0',
      },
    });

    if (!response.ok) {
      throw createApiError('upstream_unavailable', `公开页面读取失败: ${response.status}`);
    }

    const raw = await readResponseTextWithLimit(response, Math.max(1_000, Number(maxBytes) || DEFAULT_MAX_BYTES));
    return stripHtmlToText(raw).slice(0, Math.max(200, Number(maxTextLength) || DEFAULT_MAX_TEXT_LENGTH));
  } catch (error) {
    if (error?.publicCode) throw error;
    if (error?.name === 'AbortError') {
      throw createApiError('upstream_unavailable', '公开页面读取超时');
    }
    throw createApiError('upstream_unavailable', `公开页面读取失败: ${error?.message || 'unknown error'}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export { fetchPublicPageText, isPublicPageFetchEnabled, stripHtmlToText, normalizePublicUrl };
```

- [ ] **Step 5: Update AI discovery service**

Modify `backend/src/services/aiDiscoveryService.js`:

```js
import { createHash } from 'node:crypto';
import { createApiError } from '../utils/apiErrors.js';
import { cleanText, normalizeContent } from './contentNormalizer.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { fetchPublicPageText, isPublicPageFetchEnabled } from './publicPageTextService.js';
```

Change `mapAiItemToContent` so `cover` never comes from AI output:

```js
function mapAiItemToContent({ type, item, index, pageText = '' }) {
  const title = cleanText(item?.title, `${TYPE_HINT[type] || type} 热门内容 ${index + 1}`);
  const sourceUrl = cleanText(item?.sourceUrl || item?.url || item?.link || '');
  const hotScore = Math.max(1, Math.round(toNumber(item?.hotScore, 1000)));
  const summary = cleanText(item?.summary || item?.reason || pageText, `${title}暂无简介`);

  return normalizeContent({
    id: buildAiSourceId({ type, title, sourceUrl, index }),
    title,
    cover: '',
    summary,
    type,
    tags: toArray(item?.tags, 8),
    actors: toArray(item?.actors || item?.studios, 8),
    author: cleanText(item?.author || item?.publisher || 'AI Discovery'),
    ipName: cleanText(item?.ipName || item?.franchise || title),
    status: cleanText(item?.status || 'ongoing'),
    hotScore,
    createdAt: cleanText(item?.createdAt || item?.releaseDate || item?.publishedAt || ''),
    updatedAt: cleanText(item?.updatedAt || item?.lastUpdated || item?.releaseDate || ''),
    source: {
      provider: 'ai_search',
      label: 'AI 热门检索',
      url: sourceUrl,
    },
  });
}
```

Change `buildPrompt`:

```js
function buildPrompt({ type, keyword, page, limit, sort }) {
  const hint = TYPE_HINT[type] || type;
  return [
    '请使用可用的搜索能力发现真实世界热门内容，严格返回 JSON，不要 markdown。',
    `目标分类: ${hint}`,
    `关键词: ${keyword || '无'}`,
    `页码: ${page}`,
    `数量: ${limit}`,
    `排序偏好: ${sort}`,
    '要求:',
    '1) 必须返回 items 数组，长度 <= 数量。',
    '2) 每项字段: title, summary, tags[], actors[], author, ipName, status(ongoing/completed), hotScore(1-10000), sourceUrl, releaseDate。',
    '3) title 必须唯一，summary 简洁准确。',
    '4) sourceUrl 必须尽量给出可公开访问的网页链接。',
    '5) 不要返回图片、封面、海报相关字段。',
    '{"items":[{"title":"","summary":"","tags":[],"actors":[],"author":"","ipName":"","status":"ongoing","hotScore":1000,"sourceUrl":"","releaseDate":"2026-01-01"}]}'
  ].join('\n');
}
```

Add helper before `searchTrendingContentsWithAi`:

```js
async function fetchPageTextForItem(item) {
  if (!isPublicPageFetchEnabled()) return '';
  const sourceUrl = cleanText(item?.sourceUrl || item?.url || item?.link || '');
  if (!sourceUrl) return '';
  try {
    return await fetchPublicPageText(sourceUrl);
  } catch {
    return '';
  }
}
```

Change the mapping loop inside `searchTrendingContentsWithAi`:

```js
  for (const item of items) {
    if (list.length >= normalizedLimit) break;
    const titleKey = cleanText(item?.title).toLowerCase();
    if (!titleKey || dedupedByTitle.has(titleKey)) continue;
    dedupedByTitle.add(titleKey);
    const pageText = await fetchPageTextForItem(item);
    list.push(mapAiItemToContent({ type, item, index: list.length, pageText }));
  }
```

Update export:

```js
export { buildPrompt, searchTrendingContentsWithAi };
```

- [ ] **Step 6: Run AI discovery tests**

Run:

```bash
npm run test --workspace=backend -- test/aiDiscoveryService.test.js
```

Expected: PASS.

## Task 2: AI-only Ingestion and Source Routing

**Files:**
- Modify: `backend/src/services/ingestionService.js`
- Modify: `backend/src/services/sourceStrategyService.js`
- Test: `backend/test/ingestionService.test.js`
- Test: `backend/test/httpRoutes.test.js`
- Test: `backend/test/contracts/apiContract.test.js`

- [ ] **Step 1: Update ingestion tests to expect `ai_search`**

In `backend/test/ingestionService.test.js`, update `makeItem`:

```js
function makeItem(id, title, updatedAt = '2026-05-12T00:00:00.000Z') {
  return {
    id,
    title,
    cover: '',
    summary: 'Real loaded content.',
    type: 'anime',
    tags: [],
    actors: [],
    author: 'AI Discovery',
    ipName: title,
    status: 'completed',
    hotScore: 99,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt,
    source: { provider: 'ai_search', label: 'AI 热门检索', url: `https://example.com/${encodeURIComponent(id)}` },
  };
}
```

Update all test IDs in this file from `anime:jikan:*` to `anime:ai-search:*`.

Update cursor assertion:

```js
const cursor = getIngestionCursor({ type: 'anime', source: 'ai_search' });
assert.equal(cursor?.cursor, 'anime:ai-search:new-1');
```

Add a new test:

```js
test('sourceForType returns ai_search for every supported type', async () => {
  const { sourceForType } = await import('../src/services/ingestionService.js');
  assert.equal(sourceForType('drama'), 'ai_search');
  assert.equal(sourceForType('novel'), 'ai_search');
  assert.equal(sourceForType('comic'), 'ai_search');
  assert.equal(sourceForType('anime'), 'ai_search');
});
```

- [ ] **Step 2: Update source routing HTTP tests**

In `backend/test/httpRoutes.test.js`, replace `system source routing endpoints update and reset effective chain` with:

```js
test('system source routing is ai_search only', async () => {
  const previous = {
    MEDIAHUB_SOURCE_CHAIN_DRAMA: process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA,
  };
  process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA = 'ai_search,tvmaze';

  try {
    const client = createTestClient();
    const snapshotResponse = await client.request({ pathname: '/api/system/source-routing' });
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshotResponse.data.code, 0);
    assert.deepEqual(snapshotResponse.data.data.supported.drama, ['ai_search']);
    assert.deepEqual(snapshotResponse.data.data.effective.drama, ['ai_search']);

    const rejectedResponse = await client.request({
      method: 'PUT',
      pathname: '/api/system/source-routing',
      body: {
        type: 'drama',
        chain: ['tvmaze', 'ai_search'],
      },
    });
    assert.equal(rejectedResponse.status, 200);
    assert.equal(rejectedResponse.data.code, 0);
    assert.deepEqual(rejectedResponse.data.data.chain, ['ai_search']);

    const clearResponse = await client.request({
      method: 'DELETE',
      pathname: '/api/system/source-routing/drama',
    });
    assert.equal(clearResponse.status, 200);
    assert.equal(clearResponse.data.code, 0);
    assert.deepEqual(clearResponse.data.data.chain, ['ai_search']);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```

In `backend/test/contracts/apiContract.test.js`, extend the `GET /api/system/settings envelope shape` test:

```js
assert.deepEqual(response.data.data.sourceRouting.effective.drama, ['ai_search']);
assert.deepEqual(response.data.data.sourceRouting.supported.anime, ['ai_search']);
```

- [ ] **Step 3: Run targeted tests and verify they fail**

Run:

```bash
npm run test --workspace=backend -- test/ingestionService.test.js test/httpRoutes.test.js test/contracts/apiContract.test.js
```

Expected: FAIL because sources still include `jikan`, `tvmaze`, `openlibrary`.

- [ ] **Step 4: Implement AI-only ingestion**

In `backend/src/services/ingestionService.js`, replace `SOURCE_BY_TYPE`:

```js
const SOURCE_BY_TYPE = {
  drama: 'ai_search',
  novel: 'ai_search',
  comic: 'ai_search',
  anime: 'ai_search',
};
```

Do not change backfill/cursor/partial-failure logic.

- [ ] **Step 5: Implement AI-only source strategy**

In `backend/src/services/sourceStrategyService.js`, replace defaults:

```js
const DEFAULT_SOURCE_CHAIN_BY_TYPE = {
  drama: ['ai_search'],
  novel: ['ai_search'],
  comic: ['ai_search'],
  anime: ['ai_search'],
};
```

Replace `normalizeSourceToken`:

```js
function normalizeSourceToken(token) {
  const value = String(token || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'builtin') return 'ai_search';
  return value;
}
```

Keep `parseSourceChain` filtering through `supportsSource`; unsupported `tvmaze/openlibrary/jikan` will be ignored.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm run test --workspace=backend -- test/ingestionService.test.js test/httpRoutes.test.js test/contracts/apiContract.test.js
```

Expected: Tests related to source routing and ingestion source pass. Some catalog/platform fallback tests may still fail until Task 3 updates catalog behavior.

## Task 3: Remove Platform API Catalog Paths

**Files:**
- Modify: `backend/src/services/catalogService.js`
- Modify: `backend/test/httpRoutes.test.js`

- [ ] **Step 1: Replace platform fallback tests with AI-only behavior**

In `backend/test/httpRoutes.test.js`, replace `POST /api/ingestion/refresh returns 429 on upstream rate limit` with:

```js
test('POST /api/ingestion/refresh returns 429 when AI search is rate limited', async () => {
  const previous = {
    UPSTREAM_RETRY_MAX_ATTEMPTS: process.env.UPSTREAM_RETRY_MAX_ATTEMPTS,
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.UPSTREAM_RETRY_MAX_ATTEMPTS = '1';
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';

  const originalFetch = global.fetch;
  resetHttpServiceRuntimeState();
  global.fetch = async (url) => {
    if (String(url).includes('example.com/v1/responses')) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const client = createTestClient();
    const response = await client.request({
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 429);
    assert.equal(response.data.code, 2003);
    assert.equal(response.data.error, 'upstream_rate_limited');
  } finally {
    global.fetch = originalFetch;
    resetHttpServiceRuntimeState();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```

Delete the test named `POST /api/ingestion/refresh falls back to builtin source after AI search 429`.

Replace `POST /api/ingestion/refresh returns 502 on upstream 500` with:

```js
test('POST /api/ingestion/refresh returns 502 when AI search returns upstream 500', async () => {
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('example.com/v1/responses')) {
      return new Response(JSON.stringify({ error: { message: 'server error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const client = createTestClient();
    const response = await client.request({
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 502);
    assert.equal(response.data.code, 2002);
    assert.equal(response.data.error, 'upstream_unavailable');
    assert.match(response.data.message, /server error|AI 搜索失败/i);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```

Replace `POST /api/ingestion/refresh returns 502 on upstream timeout` with:

```js
test('POST /api/ingestion/refresh returns 502 when AI search times out', async () => {
  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('example.com/v1/responses')) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const client = createTestClient();
    const response = await client.request({
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 502);
    assert.equal(response.data.code, 2002);
    assert.equal(response.data.error, 'upstream_unavailable');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
npm run test --workspace=backend -- test/httpRoutes.test.js
```

Expected: FAIL while `catalogService.js` still contains platform-specific fetch branches or rate-limit behavior differs.

- [ ] **Step 3: Simplify catalog imports and constants**

In `backend/src/services/catalogService.js`, replace imports and remove platform constants/functions:

```js
import { createApiError } from '../utils/apiErrors.js';
import {
  upsertContents,
  listCachedContents,
  getCachedContentById,
  countCachedContentsByType,
} from '../repositories/contentRepository.js';
import { getAiConfigPrivate } from './aiConfigService.js';
import { rankContentsWithAi } from './aiRankingService.js';
import { searchTrendingContentsWithAi } from './aiDiscoveryService.js';
import {
  resolveSourceChainByType,
  rankSourceChainByHealth,
  recordSourceOutcome,
} from './sourceStrategyService.js';
```

Delete these from `catalogService.js`:

```js
import { fetchJson } from './httpService.js';
import { normalizeContent, DEFAULT_COVER, cleanText } from './contentNormalizer.js';
const TVMAZE_BASE_URL = 'https://api.tvmaze.com';
const OPENLIB_BASE_URL = 'https://openlibrary.org';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const BUILTIN_SOURCE_BY_TYPE = { ... };
function mapTvMazeShow(show) { ... }
function mapOpenLibraryDoc(doc, type) { ... }
function mapJikanAnime(anime) { ... }
function getBuiltinSourceByType(type) { ... }
async function fetchDramaList(...) { ... }
async function fetchOpenLibraryList(...) { ... }
async function fetchAnimeList(...) { ... }
async function fetchBuiltinListByType(...) { ... }
async function fetchDramaDetail(rawId) { ... }
async function fetchOpenLibraryDetail(...) { ... }
async function fetchAnimeDetail(rawId) { ... }
```

Keep `ensureType`, `sortContents`, cache helpers, `fetchListByType`, `ensureContentTypeSeeded`, `listContents`, `getContentById`, and `resetCatalogRuntimeState`.

- [ ] **Step 4: Implement AI-only source fetch and cache-only detail**

Replace `fetchBySourceToken`:

```js
async function fetchBySourceToken({
  source,
  type,
  keyword,
  page,
  limit,
  sort,
}) {
  if (source !== 'ai_search') {
    return { list: [], total: 0 };
  }

  return searchTrendingContentsWithAi({
    type,
    keyword,
    page,
    limit,
    sort,
  });
}
```

Replace `parseContentId`:

```js
function parseContentId(contentId) {
  const [type, provider, rawId] = String(contentId || '').split(':');
  if (!type || !provider || !rawId) {
    throw createApiError('invalid_request', 'Invalid content id');
  }
  ensureType(type);
  return { type, provider, rawId };
}
```

Replace `fetchDetailById`:

```js
async function fetchDetailById(contentId) {
  parseContentId(contentId);
  throw createApiError('not_found', '内容尚未入库，请先刷新热门数据');
}
```

Keep `getContentById` cache-first:

```js
async function getContentById(contentId) {
  const cached = getCachedContentById(contentId, { stale: false });
  if (cached) {
    return { ...cached, relatedContents: [], similarContents: [] };
  }

  try {
    return await fetchDetailById(contentId);
  } catch (error) {
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', `获取内容详情失败: ${error.message}`, { error });
  }
}
```

- [ ] **Step 5: Ensure AI rate-limit maps to 429**

If `backend/src/utils/apiErrors.js` already maps `upstream_rate_limited`, update `callAiSearch` in `backend/src/services/aiDiscoveryService.js`:

```js
  if (!response.ok) {
    const message = cleanText(payload?.error?.message || response.statusText || 'AI 搜索失败');
    if (response.status === 429) {
      throw createApiError('upstream_rate_limited', `AI 搜索失败: ${message}`, {
        status: response.status,
      });
    }
    throw createApiError('upstream_unavailable', `AI 搜索失败: ${message}`, {
      status: response.status,
    });
  }
```

- [ ] **Step 6: Run catalog-related route tests**

Run:

```bash
npm run test --workspace=backend -- test/httpRoutes.test.js
```

Expected: PASS.

## Task 4: Default No-image API Responses

**Files:**
- Modify: `backend/src/services/contentResponseService.js`
- Modify: `backend/test/httpRoutes.test.js`
- Modify: `backend/test/contracts/apiContract.test.js`

- [ ] **Step 1: Update tests to expect cover omitted by default**

In `backend/test/httpRoutes.test.js`, in `GET /api/contents reads database rows directly when cache exists`, add:

```js
assert.equal('cover' in response.data.data.list[0], false);
```

In `GET /api/contents/:id reads database detail directly when cache exists`, add:

```js
assert.equal('cover' in response.data.data, false);
```

Rename `GET /api/contents omits cover when MEDIAHUB_HIDE_COVER=true` to:

```js
test('GET /api/contents omits cover by default', async () => {
```

Remove env var setup/restore from that test and keep only the list/detail assertions.

Add this import near the top of `backend/test/contracts/apiContract.test.js`:

```js
import { upsertContents } from '../../src/repositories/contentRepository.js';
```

Append this test to `backend/test/contracts/apiContract.test.js`:

```js

test('API contract: content responses omit cover by default', async () => {
  const client = createTestClient();
  upsertContents([{
    id: 'anime:ai-search:no-cover-contract',
    title: 'No Cover Contract',
    cover: 'https://example.com/hidden.jpg',
    summary: 'No cover should be exposed.',
    type: 'anime',
    tags: [],
    actors: [],
    author: 'AI',
    ipName: 'No Cover Contract',
    status: 'completed',
    hotScore: 100,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    source: { provider: 'ai_search', label: 'AI 热门检索', url: 'https://example.com/no-cover' },
  }]);

  const response = await client.request({ pathname: '/api/contents?type=anime&page=1&limit=10' });
  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'contents');
  assert.equal('cover' in response.data.data.list[0], false);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm run test --workspace=backend -- test/httpRoutes.test.js test/contracts/apiContract.test.js
```

Expected: FAIL because `cover` is still returned unless `MEDIAHUB_HIDE_COVER=true`.

- [ ] **Step 3: Make response shaping no-cover by default**

Replace `isCoverHidden` in `backend/src/services/contentResponseService.js`:

```js
function isCoverHidden() {
  const raw = String(process.env.MEDIAHUB_SHOW_COVER || '').trim().toLowerCase();
  return !['1', 'true', 'yes', 'on'].includes(raw);
}
```

Keep all recursive stripping logic unchanged.

- [ ] **Step 4: Run no-image response tests**

Run:

```bash
npm run test --workspace=backend -- test/httpRoutes.test.js test/contracts/apiContract.test.js
```

Expected: PASS.

## Task 5: Admin UI AI-only Source Status

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`
- Modify: `frontend/src/pages/admin/SourceRoutingSection.tsx`
- Modify: `frontend/src/pages/admin/SystemSettingsCard.tsx`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Simplify admin state and handlers**

In `frontend/src/pages/Admin.tsx`, remove these imports:

```ts
clearSourceRouting,
upsertSourceRouting,
```

Remove state:

```ts
const [routingBusyType, setRoutingBusyType] = useState<ContentType | null>(null);
```

Delete functions:

```ts
const applySourceChain = useCallback(...)
const resetSourceChain = useCallback(...)
```

Change `SourceRoutingSection` usage:

```tsx
<SourceRoutingSection
  routing={settings?.sourceRouting || null}
  sourceHealth={sourceHealth}
  loadingHealth={loadingHealth}
  onRefreshHealth={refreshSourceHealth}
/>
```

- [ ] **Step 2: Convert source routing section to status-only**

Replace `frontend/src/pages/admin/SourceRoutingSection.tsx` with:

```tsx
import type { SourceHealth, SourceRoutingSettings } from '../../types';
import { TYPE_OPTIONS } from './types';

interface SourceRoutingSectionProps {
  routing: SourceRoutingSettings | null;
  sourceHealth: SourceHealth[];
  loadingHealth: boolean;
  onRefreshHealth: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  ai_search: 'AI 热门检索',
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] || source;
}

function chainLabel(chain: string[]) {
  if (!Array.isArray(chain) || chain.length === 0) return 'AI 热门检索';
  return chain.map(sourceLabel).join(' -> ');
}

export default function SourceRoutingSection({
  routing,
  sourceHealth,
  loadingHealth,
  onRefreshHealth,
}: SourceRoutingSectionProps) {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">AI 数据获取状态</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            数据统一由 AI 搜索发现并入库，不再提供平台源切换。
          </p>
        </div>
        <button
          onClick={onRefreshHealth}
          disabled={loadingHealth}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[var(--border)] bg-[var(--bg-card)] cursor-pointer disabled:opacity-60"
        >
          {loadingHealth ? '刷新中...' : '刷新健康状态'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {TYPE_OPTIONS.map(item => {
          const type = item.id;
          const effective = routing?.effective?.[type] || ['ai_search'];

          return (
            <div key={type} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <strong>{item.label}</strong>
                <span className="text-xs text-[var(--text-muted)]">AI 搜索</span>
              </div>
              <p
                className="text-xs text-[var(--text-muted)]"
                data-testid={`admin-source-routing-effective-${type}`}
              >
                当前链路：{chainLabel(effective)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="py-2 pr-3">分类</th>
              <th className="py-2 pr-3">数据源</th>
              <th className="py-2 pr-3">健康分</th>
              <th className="py-2 pr-3">成功/失败</th>
              <th className="py-2 pr-3">限流</th>
              <th className="py-2 pr-3">EWMA 延迟</th>
              <th className="py-2 pr-3">最近状态</th>
              <th className="py-2">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {sourceHealth.length > 0 ? sourceHealth.map(item => (
              <tr key={`${item.type}:${item.source}`} className="border-b border-[var(--border)]/50">
                <td className="py-2 pr-3">{item.type}</td>
                <td className="py-2 pr-3">{sourceLabel(item.source)}</td>
                <td className="py-2 pr-3" data-testid={`admin-source-health-score-${item.type}-${item.source}`}>
                  {item.score}
                </td>
                <td className="py-2 pr-3">{item.successes}/{item.failures}</td>
                <td className="py-2 pr-3">{item.rateLimited}</td>
                <td className="py-2 pr-3">{item.ewmaLatencyMs || 0} ms</td>
                <td className="py-2 pr-3">{item.lastStatus}</td>
                <td className="py-2">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '-'}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="py-6 text-center text-xs text-[var(--text-muted)]">
                  尚无 AI 搜索健康采样，可先执行手动获取/入库。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Simplify system settings source display**

In `frontend/src/pages/admin/SystemSettingsCard.tsx`, delete:

```ts
const dramaSourceRouting = ...
const novelSourceRouting = ...
const comicSourceRouting = ...
const animeSourceRouting = ...
```

Replace the four source-chain `<p>` rows with:

```tsx
<p>数据获取：AI 搜索发现</p>
<p>图片返回：关闭</p>
```

- [ ] **Step 4: Remove unused frontend API functions if no imports remain**

In `frontend/src/api/index.ts`, delete only if `rg "getSourceRoutingSettings|upsertSourceRouting|clearSourceRouting" frontend/src` shows no usage:

```ts
export async function getSourceRoutingSettings() { ... }
export async function upsertSourceRouting(...) { ... }
export async function clearSourceRouting(...) { ... }
```

Keep `SourceRoutingSettings` type because settings still includes a read-only snapshot.

- [ ] **Step 5: Run frontend static checks**

Run:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: PASS.

## Task 6: Documentation and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README architecture and commands**

In `README.md`, replace the “关键运行链路” section with:

```md
### 关键运行链路
1. 前端只调用 `/api/*`。
2. 后端使用 AI 搜索发现热门内容，并可读取公开网页文本辅助结构化。
3. 后端不再调用 TVMaze、OpenLibrary、Jikan 等专用内容平台 API。
4. 内容统一归一化后入库，并提供列表/详情/推荐查询。
5. API 默认不返回 `cover` 字段，前端使用无图占位展示。
6. 启动后自动刷新全部分类，之后每日定时刷新。
```

Add an AI config note under startup:

```md
### AI 数据获取配置
至少需要配置：
- `MEDIAHUB_AI_ENABLED=true`
- `MEDIAHUB_AI_API_KEY=<your-key>`
- `MEDIAHUB_AI_MODEL=<model>`

可选：
- `MEDIAHUB_AI_BASE_URL`：默认 `https://api.openai.com/v1`
- `MEDIAHUB_AI_SEARCH_WEB_ENABLED`：默认 `true`
- `MEDIAHUB_AI_DISCOVERY_PUBLIC_PAGE_ENABLED`：默认 `true`
```

Remove references that say “平台采集”“平台来源”“平台源路由” as active functionality.

- [ ] **Step 2: Run backend full test suite**

Run:

```bash
npm run test --workspace=backend
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint and build**

Run:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: PASS.

- [ ] **Step 4: Run root build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Inspect remaining platform API references**

Run:

```bash
rg -n "TVMaze|OpenLibrary|Jikan|api\\.tvmaze|openlibrary\\.org|api\\.jikan|tvmaze|openlibrary|jikan|cover|image" backend/src frontend/src README.md
```

Expected:
- No platform API references remain in active backend acquisition code.
- `cover` may remain in database/repository/type compatibility and response stripping.
- `image` may remain only in generic CSS or unrelated text, not in AI discovery prompt.

- [ ] **Step 6: Final git status review**

Run:

```bash
git status --short
```

Expected: Shows only intentional modified/new files. Do not commit unless the user explicitly asks.
