# MediaHub AI Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-fake-data MediaHub ingestion loop that uses public APIs/public webpages plus AI-ready normalization, with clear frontend error and retry UX.

**Architecture:** Keep the existing React/Vite + Express workspace. Split backend catalog logic into focused source/normalization/error modules, remove fallback fake data, and expose consistent API errors. Keep frontend pages intact but add reusable retry/error states and source metadata rendering.

**Tech Stack:** Node.js 22, Express, React 19, Vite, TypeScript, built-in `node:test` for backend unit tests, existing ESLint/build scripts.

---

## File Map

- Create: `backend/src/utils/apiErrors.js` — API error codes and helpers.
- Create: `backend/src/services/contentNormalizer.js` — pure mapping helpers and source metadata normalization.
- Create: `backend/src/services/aiEnrichmentService.js` — AI-ready enrichment stub that validates public text/API payloads without calling a local model.
- Create: `backend/test/catalogService.test.js` — backend unit tests for no fake fallback and error mapping.
- Create: `backend/test/contentNormalizer.test.js` — backend unit tests for normalization.
- Modify: `backend/package.json` — add `test` script.
- Modify: `backend/src/middleware/errorHandler.js` — return stable error codes.
- Modify: `backend/src/services/catalogService.js` — remove fake fallback, use normalizer, map upstream errors.
- Modify: `backend/src/services/httpService.js` — expose timeout/rate-limit/upstream error classification.
- Modify: `backend/src/services/recommendationService.js` — handle upstream errors without fabricating recommendations.
- Modify: `frontend/src/types/index.ts` — add `source` metadata and optional error code shape.
- Modify: `frontend/src/api/client.ts` — preserve API error code/status.
- Modify: `frontend/src/api/index.ts` — expose `retry` keys and stable loading behavior.
- Create: `frontend/src/components/ApiState.tsx` — shared empty/error/retry UI.
- Modify: `frontend/src/pages/Home.tsx` — use API state, retry, cleaner mobile layout.
- Modify: `frontend/src/pages/Detail.tsx` — render source metadata, better failure state.
- Modify: `frontend/src/components/ContentCard.tsx` — reduce mobile button crowding and show source truthfully.
- Modify: `frontend/src/index.css` — polish responsive spacing and state components.

## Task 1: Backend Test Harness

**Files:**
- Modify: `backend/package.json`
- Create: `backend/test/contentNormalizer.test.js`

- [ ] **Step 1: Add backend test script**

Update `backend/package.json` scripts to include:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write failing normalizer test**

Create `backend/test/contentNormalizer.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent } from '../src/services/contentNormalizer.js';

test('normalizeContent preserves real source metadata and required fields', () => {
  const result = normalizeContent({
    id: 'anime:jikan:1',
    title: 'Cowboy Bebop',
    cover: 'https://example.com/cover.jpg',
    summary: 'Space bounty hunters.',
    type: 'anime',
    tags: ['Action'],
    actors: ['Sunrise'],
    author: 'Original',
    ipName: 'Cowboy Bebop',
    status: 'completed',
    hotScore: 9000,
    createdAt: '1998-04-03T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    source: {
      provider: 'jikan',
      label: 'Jikan',
      url: 'https://api.jikan.moe/v4/anime/1',
    },
  });

  assert.equal(result.id, 'anime:jikan:1');
  assert.equal(result.source.provider, 'jikan');
  assert.equal(result.source.label, 'Jikan');
  assert.equal(result.source.url, 'https://api.jikan.moe/v4/anime/1');
  assert.deepEqual(result.tags, ['Action']);
});
```

- [ ] **Step 3: Run test to verify RED**

Run: `npm run test --workspace=backend`

Expected: FAIL with module not found for `contentNormalizer.js`.

## Task 2: Content Normalizer

**Files:**
- Create: `backend/src/services/contentNormalizer.js`
- Modify: `backend/src/services/catalogService.js`

- [ ] **Step 1: Implement normalizer**

Create `backend/src/services/contentNormalizer.js`:

```javascript
const DEFAULT_COVER = 'https://placehold.co/300x400/111827/ffffff?text=MediaHub';
const VALID_TYPES = new Set(['drama', 'novel', 'comic', 'anime']);
const VALID_STATUS = new Set(['ongoing', 'completed']);

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T00:00:00.000Z`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeStatus(input = '') {
  const value = String(input || '').toLowerCase();
  if (value.includes('running') || value.includes('publishing') || value.includes('airing') || value.includes('ongoing')) {
    return 'ongoing';
  }
  return VALID_STATUS.has(value) ? value : 'completed';
}

function normalizeStringArray(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item)).filter(Boolean))].slice(0, max);
}

function normalizeSource(source = {}) {
  const provider = cleanText(source.provider, 'unknown').toLowerCase();
  return {
    provider,
    label: cleanText(source.label, provider),
    url: cleanText(source.url),
  };
}

function normalizeContent(content) {
  const type = VALID_TYPES.has(content?.type) ? content.type : 'drama';
  const title = cleanText(content?.title, '未命名内容');

  return {
    id: cleanText(content?.id),
    title,
    cover: cleanText(content?.cover, DEFAULT_COVER),
    summary: cleanText(content?.summary, `${title}暂无简介`),
    type,
    tags: normalizeStringArray(content?.tags, 8),
    actors: normalizeStringArray(content?.actors, 8),
    author: cleanText(content?.author),
    ipName: cleanText(content?.ipName, title),
    status: normalizeStatus(content?.status),
    hotScore: Math.max(0, Math.round(Number(content?.hotScore) || 0)),
    createdAt: toIsoDate(content?.createdAt),
    updatedAt: toIsoDate(content?.updatedAt),
    source: normalizeSource(content?.source),
  };
}

export {
  DEFAULT_COVER,
  cleanText,
  normalizeStatus,
  toIsoDate,
  normalizeContent,
};
```

- [ ] **Step 2: Run normalizer test to verify GREEN**

Run: `npm run test --workspace=backend -- contentNormalizer`

Expected: PASS.

## Task 3: Stable API Errors

**Files:**
- Create: `backend/src/utils/apiErrors.js`
- Modify: `backend/src/middleware/errorHandler.js`
- Create: `backend/test/catalogService.test.js`

- [ ] **Step 1: Write failing error handler test**

Create `backend/test/catalogService.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError } from '../src/utils/apiErrors.js';

test('createApiError exposes stable http status and public code', () => {
  const err = createApiError('upstream_rate_limited', 'Jikan rate limited');

  assert.equal(err.statusCode, 429);
  assert.equal(err.publicCode, 'upstream_rate_limited');
  assert.equal(err.message, 'Jikan rate limited');
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test --workspace=backend -- catalogService`

Expected: FAIL with module not found for `apiErrors.js`.

- [ ] **Step 3: Implement stable API errors**

Create `backend/src/utils/apiErrors.js`:

```javascript
const ERROR_META = {
  invalid_request: { statusCode: 400, numericCode: 1001 },
  not_found: { statusCode: 404, numericCode: 1002 },
  unauthorized: { statusCode: 401, numericCode: 1004 },
  ai_extract_failed: { statusCode: 422, numericCode: 1401 },
  upstream_rate_limited: { statusCode: 429, numericCode: 2003 },
  upstream_unavailable: { statusCode: 502, numericCode: 2002 },
  internal_error: { statusCode: 500, numericCode: 2001 },
};

function createApiError(publicCode, message, details = {}) {
  const meta = ERROR_META[publicCode] || ERROR_META.internal_error;
  const error = new Error(message || publicCode);
  error.statusCode = meta.statusCode;
  error.code = meta.numericCode;
  error.publicCode = publicCode in ERROR_META ? publicCode : 'internal_error';
  error.details = details;
  return error;
}

export { ERROR_META, createApiError };
```

Modify `backend/src/middleware/errorHandler.js` to include `error` string:

```javascript
export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 2001;
  const error = err.publicCode || (statusCode === 500 ? 'internal_error' : 'invalid_request');
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');
  res.status(statusCode).json({ code, error, message });
}
```

- [ ] **Step 4: Run error test to verify GREEN**

Run: `npm run test --workspace=backend -- catalogService`

Expected: PASS.

## Task 4: Remove Fake Data Fallback

**Files:**
- Modify: `backend/src/services/catalogService.js`
- Modify: `backend/src/services/httpService.js`
- Modify: `backend/src/utils/store.js`
- Test: `backend/test/catalogService.test.js`

- [ ] **Step 1: Add failing no-fake-data test**

Append to `backend/test/catalogService.test.js`:

```javascript
import { parseContentId } from '../src/services/catalogService.js';

test('parseContentId rejects fallback provider ids', () => {
  assert.throws(
    () => parseContentId('anime:fallback:1'),
    /Unsupported content source/
  );
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test --workspace=backend -- catalogService`

Expected: FAIL because fallback provider is currently accepted later or message differs.

- [ ] **Step 3: Update HTTP error classification**

Modify `backend/src/services/httpService.js`:

```javascript
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
```

- [ ] **Step 4: Remove fake fallback from catalog service**

In `backend/src/services/catalogService.js`:

- Import `normalizeContent`, `DEFAULT_COVER`, `cleanText`, `normalizeStatus`, `toIsoDate` from `contentNormalizer.js`.
- Import `createApiError` from `utils/apiErrors.js`.
- Delete `fallbackList` and `fallbackDetail`.
- Make `parseContentId` reject provider `fallback`:

```javascript
function parseContentId(contentId) {
  const [type, provider, rawId] = String(contentId || '').split(':');
  if (!type || !provider || !rawId) {
    throw createApiError('invalid_request', 'Invalid content id');
  }
  if (provider === 'fallback') {
    throw createApiError('invalid_request', 'Unsupported content source');
  }
  return { type, provider, rawId };
}
```

- In `fetchListByType`, remove the `try/catch` that returns fallback and allow upstream errors to propagate.
- In `fetchDetailById`, remove the catch that returns fallback and allow upstream errors to propagate.
- Ensure every mapper calls `normalizeContent({... source })` with real source metadata.

- [ ] **Step 5: Update store snapshots**

Modify `backend/src/utils/store.js` `toSnapshot` to preserve `source`:

```javascript
source: content.source || { provider: 'unknown', label: 'Unknown', url: '' },
```

- [ ] **Step 6: Run tests to verify GREEN**

Run: `npm run test --workspace=backend`

Expected: PASS.

## Task 5: AI Enrichment Boundary

**Files:**
- Create: `backend/src/services/aiEnrichmentService.js`
- Create: `backend/test/aiEnrichmentService.test.js`

- [ ] **Step 1: Write failing AI enrichment boundary tests**

Create `backend/test/aiEnrichmentService.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichPublicContent } from '../src/services/aiEnrichmentService.js';

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
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test --workspace=backend -- aiEnrichmentService`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement AI-ready enrichment service**

Create `backend/src/services/aiEnrichmentService.js`:

```javascript
import { createApiError } from '../utils/apiErrors.js';
import { cleanText, normalizeContent } from './contentNormalizer.js';

const TAG_KEYWORDS = [
  '科幻', '动作', '冒险', '爱情', '悬疑', '奇幻', '历史', '喜剧', '犯罪', '青春',
  'anime', 'manga', 'fiction', 'drama', 'comedy', 'action', 'adventure', 'fantasy', 'mystery',
];

function inferTags(text) {
  const lower = text.toLowerCase();
  const tags = TAG_KEYWORDS.filter(tag => lower.includes(tag.toLowerCase()));
  return [...new Set(tags)].slice(0, 6);
}

function buildSummary(text) {
  const cleaned = cleanText(text);
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}...` : cleaned;
}

async function enrichPublicContent({ title, text, type, sourceUrl, base = {} }) {
  const cleanedText = cleanText(text);
  if (cleanedText.length < 40) {
    throw createApiError('ai_extract_failed', '公开页面文本不足，无法完成 AI 结构化抽取', { sourceUrl });
  }

  return normalizeContent({
    ...base,
    id: base.id || `${type}:public:${encodeURIComponent(cleanText(title).slice(0, 80))}`,
    title: cleanText(title, base.title || '未命名内容'),
    summary: base.summary || buildSummary(cleanedText),
    type,
    tags: base.tags?.length ? base.tags : inferTags(cleanedText),
    actors: base.actors || [],
    author: base.author || 'Public Web',
    ipName: base.ipName || cleanText(title),
    status: base.status || 'completed',
    hotScore: base.hotScore || 100,
    source: {
      provider: 'public-web',
      label: 'Public Web',
      url: sourceUrl,
    },
  });
}

export { enrichPublicContent };
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test --workspace=backend -- aiEnrichmentService`

Expected: PASS.

## Task 6: Frontend API Error State

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/ApiState.tsx`
- Modify: `frontend/src/pages/Home.tsx`

- [ ] **Step 1: Add frontend types**

Update `Content` in `frontend/src/types/index.ts`:

```typescript
source?: {
  provider: string;
  label: string;
  url?: string;
};
```

Add:

```typescript
export class ApiClientError extends Error {
  status: number;
  code?: number;
  error?: string;

  constructor(message: string, status: number, code?: number, error?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.error = error;
  }
}
```

- [ ] **Step 2: Preserve API error metadata**

Modify `frontend/src/api/client.ts`:

```typescript
import { API_BASE } from '../constants';
import { ApiClientError, type ApiResponse } from '../types';
```

In `fetchApi`, replace error throw with:

```typescript
if (!response.ok || data.code !== 0) {
  throw new ApiClientError(data.message || 'API Error', response.status, data.code, data.error);
}
```

- [ ] **Step 3: Create reusable API state component**

Create `frontend/src/components/ApiState.tsx`:

```tsx
interface ApiStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function ApiState({ title, description, actionLabel = '重试', onAction }: ApiStateProps) {
  return (
    <div className="api-state">
      <div className="text-3xl mb-3">⚠</div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">{description}</p>
      {onAction && (
        <button onClick={onAction} className="api-state-button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add retry key to Home**

In `frontend/src/pages/Home.tsx`, add state:

```typescript
const [retryKey, setRetryKey] = useState(0);
```

Pass retry key into hooks by adding it to hook dependencies in Task 7. For now, use:

```tsx
<ApiState
  title="内容源暂不可用"
  description={contentError || '公开 API 暂时无法返回内容，请稍后重试。'}
  onAction={() => setRetryKey(key => key + 1)}
/>
```

- [ ] **Step 5: Run frontend lint/build**

Run: `npm run lint --workspace=frontend && npm run build`

Expected: PASS.

## Task 7: Frontend Hook Retry and Detail Source Metadata

**Files:**
- Modify: `frontend/src/api/index.ts`
- Modify: `frontend/src/pages/Detail.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Update hooks to accept retryKey**

Modify hook signatures:

```typescript
export function useContents(type: string, page = 1, keyword = '', sort: 'hot' | 'latest' = 'hot', retryKey = 0)
```

Add `retryKey` to dependency array.

```typescript
export function useContentDetail(id: string, retryKey = 0)
```

Add `retryKey` to dependency array.

```typescript
export function useRecommendations(type?: string, retryKey = 0)
```

Add `retryKey` to dependency array.

- [ ] **Step 2: Render source metadata in Detail**

In `frontend/src/pages/Detail.tsx`, add below hot score/action row:

```tsx
{content.source && (
  <div className="mt-4 text-xs text-[var(--text-muted)]">
    数据来源：{content.source.url ? (
      <a href={content.source.url} target="_blank" rel="noreferrer" className="text-[var(--accent-primary)] hover:underline">
        {content.source.label}
      </a>
    ) : content.source.label}
    <span className="mx-2">·</span>
    更新于 {new Date(content.updatedAt).toLocaleDateString('zh-CN')}
  </div>
)}
```

- [ ] **Step 3: Add CSS for API state**

Append to `frontend/src/index.css`:

```css
.api-state {
  border: 1px solid var(--border);
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: 40px 24px;
  text-align: center;
}

.api-state-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--gradient-gold);
  color: #0a0a0f;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 640px) {
  .card-meta-bottom {
    align-items: flex-start;
    flex-direction: column;
  }

  .card-watched-btn {
    padding: 5px 8px;
  }
}
```

- [ ] **Step 4: Run frontend lint/build**

Run: `npm run lint --workspace=frontend && npm run build`

Expected: PASS.

## Task 8: Manual API and Browser Verification

**Files:**
- No production file changes unless verification finds a defect.

- [ ] **Step 1: Run backend tests**

Run: `npm run test --workspace=backend`

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run: `npm run lint --workspace=frontend`

Expected: PASS.

Run: `npm run build`

Expected: PASS. Tailwind/lightningcss warnings should be recorded if still present.

- [ ] **Step 3: Start backend and frontend**

Run backend with approved elevated command if sandbox blocks port binding:

```bash
npm run start --workspace=backend
```

Run frontend:

```bash
npm run dev:frontend
```

- [ ] **Step 4: API smoke checks**

Use `curl --noproxy '*'` for:

```bash
curl --noproxy '*' -sS http://127.0.0.1:3001/api/health
curl --noproxy '*' -sS http://127.0.0.1:3001/api/categories
curl --noproxy '*' -sS 'http://127.0.0.1:3001/api/contents?type=anime&page=1&limit=2'
```

Expected: health/categories success. Content either returns real data or stable upstream error; it must not return fallback IDs or example titles.

- [ ] **Step 5: Browser checks**

Open the frontend in Chrome and verify:

- 首页 loads without layout overflow.
- Short drama, novel, comic, anime tabs are clickable.
- Search changes result state.
- Error state has retry button and no fake cards.
- Detail page shows source metadata for real content.
- Login, mark watched, favorite, profile history/favorites work for real content.
- Mobile viewport keeps controls tappable.

## Self-Review

Spec coverage:

- No fake data: Task 4.
- Public API/source metadata: Tasks 2, 4, 7.
- AI extraction boundary: Task 5.
- Frontend error/retry: Tasks 6, 7.
- Browser and API verification: Task 8.

Known user constraint:

- Do not run `git commit`, `git push`, branch operations, or reset unless explicitly requested by the user. Commit steps from the generic planning skill are intentionally omitted.
