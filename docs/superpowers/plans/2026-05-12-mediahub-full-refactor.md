# MediaHub Full Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully refactor MediaHub into a real-API-first content hub with SQLite-backed real-result cache, persistent user actions, cleaner module boundaries, and simplified polished UI.

**Architecture:** Keep the existing Express + React/Vite workspace and avoid new heavy dependencies. Add missing ingestion and user repository boundaries, make SQLite the only persistent backend state for users/content cache/source runs, then simplify frontend page composition around source status, content grids, and clear primary actions.

**Tech Stack:** Node.js 22, Express 4, node:sqlite, React 19, TypeScript, Vite 8, Tailwind CSS v4 utilities, node:test, ESLint.

---

## File Structure

- Create: `backend/src/repositories/userRepository.js` — SQLite persistence for users, watch history, favorites.
- Create: `backend/src/services/ingestionService.js` — manual refresh orchestration and source run recording.
- Create: `backend/src/routes/ingestion.js` — `POST /api/ingestion/refresh`.
- Modify: `backend/src/index.js` — mount ingestion route.
- Modify: `backend/src/utils/store.js` — keep only static categories and limits.
- Modify: `backend/src/services/userService.js` — replace in-memory users/snapshots with repositories.
- Modify: `backend/src/services/recommendationService.js` — build profile from persisted history.
- Modify: `backend/src/services/catalogService.js` — export refresh-safe list loader and source mapping.
- Modify: `backend/src/repositories/contentRepository.js` — expose recent content helpers if needed.
- Add/modify backend tests: `backend/test/ingestionService.test.js`, `backend/test/userRepository.test.js`, `backend/test/userService.test.js`.
- Modify: `frontend/src/types/index.ts` — add stale/source status types.
- Modify: `frontend/src/api/client.ts` — add source status and refresh calls.
- Modify: `frontend/src/api/index.ts` — expose `useSourceStatus` and hooks refresh support.
- Create: `frontend/src/components/SourceStatusBar.tsx` — status, stale, refresh UI.
- Create: `frontend/src/components/ContentGrid.tsx` — shared grid/loading/empty rendering.
- Modify: `frontend/src/pages/Home.tsx` — restructure page around source status and shared grids.
- Modify: `frontend/src/pages/Detail.tsx` — simplify hierarchy and action layout.
- Modify: `frontend/src/pages/Profile.tsx` — simplify stats/list layout and reuse patterns.
- Modify: `frontend/src/components/ContentCard.tsx` — reduce mobile crowding and improve button semantics.
- Modify: `frontend/src/index.css` — responsive polish and compact action styles.

## Task 1: Restore Ingestion Backend

**Files:**
- Create: `backend/src/services/ingestionService.js`
- Create: `backend/src/routes/ingestion.js`
- Modify: `backend/src/index.js`
- Test: `backend/test/ingestionService.test.js`

- [ ] **Step 1: Confirm existing failing test**

Run: `npm test --workspace=backend -- test/ingestionService.test.js`

Expected: FAIL with `Cannot find module ... ingestionService.js`.

- [ ] **Step 2: Implement ingestion service**

Create `backend/src/services/ingestionService.js` with:

```javascript
import { fetchListByType } from './catalogService.js';
import { upsertContents } from '../repositories/contentRepository.js';
import { recordSourceRun } from '../repositories/sourceRepository.js';
import { createApiError } from '../utils/apiErrors.js';

const SOURCE_BY_TYPE = {
  drama: 'tvmaze',
  novel: 'openlibrary',
  comic: 'openlibrary',
  anime: 'jikan',
};

function sourceForType(type) {
  const source = SOURCE_BY_TYPE[type];
  if (!source) throw createApiError('invalid_request', 'Invalid content type');
  return source;
}

async function refreshContentType(type, { loader } = {}) {
  const source = sourceForType(type);
  const startedAt = new Date().toISOString();

  try {
    const result = await (loader ? loader() : fetchListByType({ type, page: 1, limit: 30, sort: 'hot', __bypassCacheFallback: true }));
    const list = Array.isArray(result?.list) ? result.list : [];
    const count = upsertContents(list);
    recordSourceRun({ type, source, status: 'success', count, error: null, startedAt });
    return { type, source, status: 'success', count };
  } catch (error) {
    recordSourceRun({ type, source, status: 'failed', count: 0, error: error.message || '刷新失败', startedAt });
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', error.message || '刷新失败');
  }
}

export { refreshContentType, sourceForType };
```

- [ ] **Step 3: Add ingestion route**

Create `backend/src/routes/ingestion.js` with:

```javascript
import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { refreshContentType } from '../services/ingestionService.js';

const router = express.Router();

router.post('/refresh', asyncHandler(async (req, res) => {
  const type = String(req.query.type || '');
  const data = await refreshContentType(type);
  res.json({ code: 0, data });
}));

export default router;
```

Modify `backend/src/index.js`:

```javascript
import ingestionRoutes from './routes/ingestion.js';
app.use('/api/ingestion', ingestionRoutes);
```

- [ ] **Step 4: Verify ingestion test**

Run: `npm test --workspace=backend -- test/ingestionService.test.js`

Expected: PASS.

## Task 2: Persist User State in SQLite

**Files:**
- Create: `backend/src/repositories/userRepository.js`
- Modify: `backend/src/services/userService.js`
- Modify: `backend/src/utils/store.js`
- Test: `backend/test/userRepository.test.js`

- [ ] **Step 1: Write repository tests**

Create `backend/test/userRepository.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createUser, findUserByUsername, getUserById, upsertWatchHistory, listWatchHistory, toggleFavorite, listFavorites } from '../src/repositories/userRepository.js';
import { upsertContents } from '../src/repositories/contentRepository.js';

const content = {
  id: 'anime:jikan:1', title: 'Persisted Anime', cover: 'https://example.com/c.jpg', summary: 'Summary',
  type: 'anime', tags: ['Action'], actors: ['Studio'], author: 'Jikan', ipName: 'Persisted Anime',
  status: 'completed', hotScore: 100, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

test('userRepository persists users, history, and favorites', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([content]);
  const user = createUser('alice');

  assert.equal(findUserByUsername('alice').id, user.id);
  assert.equal(getUserById(user.id).username, 'alice');

  upsertWatchHistory(user.id, content.id);
  assert.equal(listWatchHistory(user.id)[0].content.title, 'Persisted Anime');

  assert.equal(toggleFavorite(user.id, content.id).isFavorite, true);
  assert.equal(listFavorites(user.id)[0].title, 'Persisted Anime');
  assert.equal(toggleFavorite(user.id, content.id).isFavorite, false);
  assert.equal(listFavorites(user.id).length, 0);
});
```

Run: `npm test --workspace=backend -- test/userRepository.test.js`

Expected: FAIL with missing module.

- [ ] **Step 2: Implement user repository**

Create `backend/src/repositories/userRepository.js` with focused SQLite functions: `createUser`, `findUserByUsername`, `getUserById`, `upsertWatchHistory`, `listWatchHistory`, `toggleFavorite`, `listFavorites`.

Implementation requirements:

- Use `crypto.randomUUID()` for user IDs.
- Insert users into `users`.
- Use `INSERT ... ON CONFLICT` for watch history and favorites.
- Join `contents` to return full content objects via `rowToContent(row, true)`.
- Delete favorite when it already exists.
- Keep ordering newest first.

- [ ] **Step 3: Refactor user service**

Modify `backend/src/services/userService.js`:

- Remove imports of `users`, `upsertContentSnapshot`, `getContentSnapshot`.
- Use `userRepository` for user lookup and writes.
- Keep `ensureContentExists(contentId)` but store fetched remote content through `upsertContents([remote])`.
- Return persisted history/favorites from repository.

- [ ] **Step 4: Trim store responsibilities**

Modify `backend/src/utils/store.js`:

- Keep `MAX_WATCH_HISTORY`, `MAX_FAVORITES`, and `categories`.
- Remove `users`, `contentSnapshots`, `upsertContentSnapshot`, `upsertContentSnapshots`, `getContentSnapshot` exports.

- [ ] **Step 5: Verify user repository and full backend tests**

Run:

```bash
npm test --workspace=backend -- test/userRepository.test.js
npm test --workspace=backend
```

Expected: all backend tests PASS.

## Task 3: Recommendation Uses Persisted Data

**Files:**
- Modify: `backend/src/services/recommendationService.js`
- Modify: `backend/src/repositories/contentRepository.js` if a helper is needed
- Test: `backend/test/recommendationService.test.js`

- [ ] **Step 1: Add recommendation persistence test**

Create `backend/test/recommendationService.test.js` that:

- Resets database.
- Inserts one watched anime and two candidate anime contents.
- Creates a user and marks watched.
- Calls `getRecommendations({ type: 'anime', limit: 2, userId })` with a loader path that can use cache when live fetch fails.
- Asserts watched content is excluded and a reason exists.

- [ ] **Step 2: Refactor recommendation service**

Modify `backend/src/services/recommendationService.js`:

- Replace in-memory `users` and `getContentSnapshot` with `getUserById` and `listWatchHistory`.
- Build profile from `history.map(item => item.content)`.
- Keep scoring rules simple: actor/IP/tag boosts and hot fallback.
- Keep no-user behavior as trending real content.

- [ ] **Step 3: Verify recommendation tests**

Run: `npm test --workspace=backend -- test/recommendationService.test.js`

Expected: PASS.

## Task 4: Frontend API Surface for Source Status

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: Add types**

In `frontend/src/types/index.ts`, add:

```typescript
export interface SourceStatus {
  type: Content['type'];
  source: string;
  status: 'success' | 'failed';
  count: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}
```

Add optional `stale?: boolean` and `cachedAt?: string` to `Content`, and optional `stale?: boolean` to `PaginatedResponse<T>`.

- [ ] **Step 2: Add API calls**

In `frontend/src/api/client.ts`, add:

```typescript
export function getSourceStatuses(signal?: AbortSignal) {
  return fetchApi<SourceStatus[]>('/sources/status', {}, signal);
}

export function refreshContentType(type: string) {
  return fetchApi<{ type: string; source: string; status: string; count: number }>(`/ingestion/refresh?type=${encodeURIComponent(type)}`, { method: 'POST' });
}
```

- [ ] **Step 3: Add hooks**

In `frontend/src/api/index.ts`, add `useSourceStatus(retryKey)` and export `refreshContentType`.

- [ ] **Step 4: Verify TypeScript**

Run: `npm run build --workspace=frontend`

Expected: PASS.

## Task 5: Home Page Restructure

**Files:**
- Create: `frontend/src/components/SourceStatusBar.tsx`
- Create: `frontend/src/components/ContentGrid.tsx`
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/components/ContentCard.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create SourceStatusBar**

Create a compact component showing:

- Source label for current type.
- Latest status success/failed/unknown.
- Last finished date if present.
- Stale badge if current content response is stale.
- Refresh button with disabled refreshing state.

- [ ] **Step 2: Create ContentGrid**

Create shared rendering for loading, empty, and grid states. Props: `items`, `loading`, `page`, `emptyTitle`, `emptyDesc`, `showReason`.

- [ ] **Step 3: Refactor Home**

Modify `Home.tsx`:

- Keep state: activeType, keyword, page, sort, retryKey.
- Add source status hook.
- Add refresh handler using `refreshContentType(activeType)`.
- Render source status above categories.
- Use `ContentGrid` for recommendations and main contents.
- Keep no fake content behavior.

- [ ] **Step 4: Polish content card mobile actions**

Modify `ContentCard.tsx`:

- Keep the card clickable.
- Use shorter mobile-safe action labels.
- Ensure action buttons do not overflow title/metadata.

- [ ] **Step 5: Verify frontend build/lint**

Run:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: PASS.

## Task 6: Detail and Profile Layout Refinement

**Files:**
- Modify: `frontend/src/pages/Detail.tsx`
- Modify: `frontend/src/pages/Profile.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Refine Detail layout**

Modify `Detail.tsx`:

- Reduce decorative blur dominance on small screens.
- Group primary buttons in a stable responsive row.
- Keep source metadata visible but not noisy.
- Show relation sections only when data exists.

- [ ] **Step 2: Refine Profile layout**

Modify `Profile.tsx`:

- Keep login form simple.
- Make stats responsive and compact.
- Ensure history/favorite tab and grid are easy to scan.

- [ ] **Step 3: Verify frontend build/lint**

Run:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: PASS.

## Task 7: End-to-End Runtime Verification

**Files:**
- No code changes unless verification exposes a bug.

- [ ] **Step 1: Start backend and frontend**

Run:

```bash
npm run dev:backend
npm run dev:frontend
```

Use existing dev server scripts and ports.

- [ ] **Step 2: API smoke test**

Run:

```bash
curl --noproxy '*' -sS http://127.0.0.1:3001/api/health
curl --noproxy '*' -sS http://127.0.0.1:3001/api/categories
curl --noproxy '*' -sS 'http://127.0.0.1:3001/api/contents?type=anime&limit=5'
curl --noproxy '*' -sS http://127.0.0.1:3001/api/sources/status
curl --noproxy '*' -sS -X POST 'http://127.0.0.1:3001/api/ingestion/refresh?type=anime'
```

Expected: health ok, categories present, real content list or clear upstream error, source statuses present after refresh.

- [ ] **Step 3: Browser desktop validation**

Use browser tooling to verify:

- Homepage loads.
- Category tabs switch.
- Search works.
- Sort buttons work.
- Refresh button works.
- Card opens detail.
- Login works.
- Mark watched works.
- Favorite works.
- Profile shows history/favorites.

- [ ] **Step 4: Browser mobile validation**

Use browser viewport emulation to verify:

- Header/search fit.
- Tabs scroll horizontally.
- Cards remain readable.
- Buttons are reachable.
- Detail and profile layouts do not overflow.

- [ ] **Step 5: Final verification**

Run:

```bash
npm test --workspace=backend
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: all PASS.
