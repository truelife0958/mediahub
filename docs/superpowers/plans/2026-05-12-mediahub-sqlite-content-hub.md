# MediaHub SQLite Content Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite-backed persistence for real content, source runs, manual ingestion refresh, and user history/favorites without introducing fake data.

**Architecture:** Use Node 22 `node:sqlite` behind small repository modules. Keep live API fetching in `catalogService`; on upstream failure, read verified cached content from SQLite and mark responses `stale: true`. Add source status and refresh endpoints, then surface cache/source state in the React homepage.

**Tech Stack:** Node.js 22 `node:sqlite`, Express, React 19, Vite, TypeScript, Node built-in test runner.

---

## File Map

- Create: `backend/src/db/database.js` — SQLite connection, schema, test DB reset.
- Create: `backend/src/repositories/contentRepository.js` — content upsert/list/detail/search.
- Create: `backend/src/repositories/sourceRepository.js` — source run recording and status queries.
- Create: `backend/src/repositories/userRepository.js` — persistent lightweight users/history/favorites.
- Create: `backend/src/services/ingestionService.js` — manual type refresh orchestration.
- Create: `backend/src/routes/ingestion.js` — `POST /api/ingestion/refresh`.
- Create: `backend/src/routes/sources.js` — `GET /api/sources/status`.
- Modify: `backend/src/index.js` — register new routes and initialize DB.
- Modify: `backend/src/services/catalogService.js` — write live results to SQLite; fallback to stale cache on upstream errors.
- Modify: `backend/src/services/userService.js` — move from in-memory behavior to SQLite repository while keeping API contract.
- Modify: `backend/src/services/recommendationService.js` — use repository snapshots/history where needed.
- Modify: `backend/src/types are implicit JS` — no TypeScript backend.
- Modify: `frontend/src/types/index.ts` — add `stale`, `cachedAt`, source status types.
- Modify: `frontend/src/api/client.ts` — add source status and refresh API functions.
- Modify: `frontend/src/api/index.ts` — add `useSourceStatus` and expose refresh helpers.
- Create: `frontend/src/components/SourceStatusBar.tsx` — cache/source state UI.
- Modify: `frontend/src/pages/Home.tsx` — show status bar, refresh button, stale notices.
- Modify: `frontend/src/index.css` — source status and stale badge styling.
- Create/Modify tests under `backend/test/*.test.js`.

## Task 1: SQLite Database Foundation

**Files:**
- Create: `backend/src/db/database.js`
- Create: `backend/test/database.test.js`

- [ ] **Step 1: Write failing database schema test**

Create `backend/test/database.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, initializeDatabase, resetDatabaseForTest } from '../src/db/database.js';

test('initializeDatabase creates content and source tables', () => {
  resetDatabaseForTest(':memory:');
  const db = getDatabase();
  initializeDatabase();

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name);

  assert.ok(tables.includes('contents'));
  assert.ok(tables.includes('source_runs'));
  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('watch_history'));
  assert.ok(tables.includes('favorites'));
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/database.test.js`

Expected: FAIL with module not found for `src/db/database.js`.

- [ ] **Step 3: Implement database module**

Create `backend/src/db/database.js`:

```javascript
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'backend/data/mediahub.sqlite');
let database;
let databasePath = process.env.MEDIAHUB_DB_PATH || DEFAULT_DB_PATH;

function openDatabase(filePath = databasePath) {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function getDatabase() {
  if (!database) database = openDatabase();
  return database;
}

function initializeDatabase() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      cover TEXT NOT NULL,
      summary TEXT NOT NULL,
      author TEXT,
      ip_name TEXT,
      status TEXT,
      hot_score INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL,
      actors_json TEXT NOT NULL,
      source_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contents_type_hot ON contents(type, hot_score DESC);
    CREATE INDEX IF NOT EXISTS idx_contents_type_updated ON contents(type, updated_at DESC);

    CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_source_runs_type_finished ON source_runs(type, finished_at DESC);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function resetDatabaseForTest(filePath = ':memory:') {
  if (database) database.close();
  databasePath = filePath;
  database = openDatabase(filePath);
  initializeDatabase();
}

export { getDatabase, initializeDatabase, resetDatabaseForTest };
```

- [ ] **Step 4: Run GREEN**

Run: `npm run test --workspace=backend -- test/database.test.js`

Expected: PASS. Node may print experimental sqlite warning.

## Task 2: Content Repository

**Files:**
- Create: `backend/src/repositories/contentRepository.js`
- Create: `backend/test/contentRepository.test.js`

- [ ] **Step 1: Write failing repository test**

Create `backend/test/contentRepository.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents, listCachedContents, getCachedContentById } from '../src/repositories/contentRepository.js';

const sample = {
  id: 'anime:jikan:1',
  title: 'Cowboy Bebop',
  cover: 'https://example.com/cover.jpg',
  summary: 'Space bounty hunters.',
  type: 'anime',
  tags: ['Action', 'Sci-Fi'],
  actors: ['Sunrise'],
  author: 'Original',
  ipName: 'Cowboy Bebop',
  status: 'completed',
  hotScore: 9000,
  createdAt: '1998-04-03T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

test('upsertContents stores and lists stale-capable cached content', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const result = listCachedContents({ type: 'anime', page: 1, limit: 10, sort: 'hot' });
  const detail = getCachedContentById('anime:jikan:1');

  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, sample.id);
  assert.equal(result.list[0].stale, true);
  assert.equal(result.list[0].source.provider, 'jikan');
  assert.equal(detail.title, sample.title);
  assert.deepEqual(detail.tags, sample.tags);
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/contentRepository.test.js`

Expected: FAIL with module not found for `contentRepository.js`.

- [ ] **Step 3: Implement content repository**

Create `backend/src/repositories/contentRepository.js` with functions:

```javascript
import { getDatabase } from '../db/database.js';

function serialize(value) {
  return JSON.stringify(value ?? []);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function rowToContent(row, stale = true) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    type: row.type,
    tags: parseJson(row.tags_json, []),
    actors: parseJson(row.actors_json, []),
    author: row.author || '',
    ipName: row.ip_name || row.title,
    status: row.status || 'completed',
    hotScore: Number(row.hot_score) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cachedAt: row.cached_at,
    stale,
    source: parseJson(row.source_json, { provider: 'unknown', label: 'Unknown', url: '' }),
  };
}

function upsertContents(contents = []) {
  if (contents.length === 0) return 0;
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO contents (
      id, type, title, cover, summary, author, ip_name, status, hot_score,
      tags_json, actors_json, source_json, created_at, updated_at, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      cover = excluded.cover,
      summary = excluded.summary,
      author = excluded.author,
      ip_name = excluded.ip_name,
      status = excluded.status,
      hot_score = excluded.hot_score,
      tags_json = excluded.tags_json,
      actors_json = excluded.actors_json,
      source_json = excluded.source_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      cached_at = excluded.cached_at
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      stmt.run(
        item.id, item.type, item.title, item.cover, item.summary, item.author || '',
        item.ipName || item.title, item.status || 'completed', Number(item.hotScore) || 0,
        serialize(item.tags || []), serialize(item.actors || []), JSON.stringify(item.source || {}),
        item.createdAt || now, item.updatedAt || now, now
      );
    }
  });
  tx(contents);
  return contents.length;
}

function listCachedContents({ type, page = 1, limit = 20, sort = 'hot', keyword = '' }) {
  const db = getDatabase();
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const orderBy = sort === 'latest' ? 'updated_at DESC' : 'hot_score DESC';
  const normalizedKeyword = String(keyword || '').trim();
  const where = normalizedKeyword
    ? 'WHERE type = ? AND (title LIKE ? OR summary LIKE ? OR author LIKE ? OR ip_name LIKE ?)'
    : 'WHERE type = ?';
  const args = normalizedKeyword
    ? [type, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`, `%${normalizedKeyword}%`]
    : [type];

  const total = db.prepare(`SELECT COUNT(*) as total FROM contents ${where}`).get(...args).total;
  const rows = db.prepare(`SELECT * FROM contents ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args, limitNum, offset);

  return {
    list: rows.map(row => rowToContent(row, true)),
    pagination: { page: pageNum, limit: limitNum, total: Number(total) || 0 },
    stale: true,
  };
}

function getCachedContentById(contentId) {
  const row = getDatabase().prepare('SELECT * FROM contents WHERE id = ?').get(contentId);
  return rowToContent(row, true);
}

export { upsertContents, listCachedContents, getCachedContentById, rowToContent };
```

- [ ] **Step 4: Run GREEN**

Run: `npm run test --workspace=backend -- test/contentRepository.test.js`

Expected: PASS.

## Task 3: Source Repository and Status API

**Files:**
- Create: `backend/src/repositories/sourceRepository.js`
- Create: `backend/src/routes/sources.js`
- Modify: `backend/src/index.js`
- Create: `backend/test/sourceRepository.test.js`

- [ ] **Step 1: Write failing source repository test**

Create `backend/test/sourceRepository.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { recordSourceRun, getSourceStatuses } from '../src/repositories/sourceRepository.js';

test('recordSourceRun stores latest source status by type', () => {
  resetDatabaseForTest(':memory:');
  recordSourceRun({ type: 'anime', source: 'jikan', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'openlibrary', status: 'failed', count: 0, error: 'timeout' });

  const statuses = getSourceStatuses();
  const anime = statuses.find(item => item.type === 'anime');
  const novel = statuses.find(item => item.type === 'novel');

  assert.equal(anime.status, 'success');
  assert.equal(anime.count, 12);
  assert.equal(novel.status, 'failed');
  assert.equal(novel.error, 'timeout');
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/sourceRepository.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement source repository**

Create `backend/src/repositories/sourceRepository.js`:

```javascript
import { getDatabase } from '../db/database.js';

function recordSourceRun({ type, source, status, count = 0, error = null, startedAt, finishedAt }) {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO source_runs (type, source, status, count, error, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(type, source, status, Number(count) || 0, error, startedAt || now, finishedAt || now);
}

function getSourceStatuses() {
  const rows = getDatabase().prepare(`
    SELECT sr.*
    FROM source_runs sr
    INNER JOIN (
      SELECT type, MAX(id) as id
      FROM source_runs
      GROUP BY type
    ) latest ON latest.id = sr.id
    ORDER BY sr.type ASC
  `).all();

  return rows.map(row => ({
    type: row.type,
    source: row.source,
    status: row.status,
    count: Number(row.count) || 0,
    error: row.error || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export { recordSourceRun, getSourceStatuses };
```

- [ ] **Step 4: Add sources route**

Create `backend/src/routes/sources.js`:

```javascript
import express from 'express';
import { getSourceStatuses } from '../repositories/sourceRepository.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ code: 0, data: getSourceStatuses() });
});

export default router;
```

Modify `backend/src/index.js`:

```javascript
import { initializeDatabase } from './db/database.js';
import sourceRoutes from './routes/sources.js';

initializeDatabase();
app.use('/api/sources', sourceRoutes);
```

- [ ] **Step 5: Run GREEN**

Run: `npm run test --workspace=backend -- test/sourceRepository.test.js`

Expected: PASS.

## Task 4: Catalog Cache Fallback

**Files:**
- Modify: `backend/src/services/catalogService.js`
- Modify: `backend/src/services/contentService.js` if required by return shape
- Test: `backend/test/catalogCacheFallback.test.js`

- [ ] **Step 1: Write failing cache fallback test**

Create `backend/test/catalogCacheFallback.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { listContents } from '../src/services/catalogService.js';

const cached = {
  id: 'anime:jikan:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cover.jpg',
  summary: 'Cached real content.',
  type: 'anime',
  tags: ['Action'],
  actors: [],
  author: 'Jikan',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 100,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

test('listContents returns stale cached content when upstream fails', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cached]);

  const result = await listContents({ type: 'anime', page: 1, limit: 10, __skipLiveFetchForTest: true });

  assert.equal(result.stale, true);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, 'Cached Anime');
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/catalogCacheFallback.test.js`

Expected: FAIL because `__skipLiveFetchForTest` is not implemented.

- [ ] **Step 3: Implement cache fallback**

In `backend/src/services/catalogService.js`:

- Import `upsertContents`, `listCachedContents`, `getCachedContentById`.
- After live list success, call `upsertContents(list)` and return `stale: false`.
- In catch, call `listCachedContents`; if it has rows return that stale result, otherwise rethrow original error.
- Add test hook:

```javascript
if (__skipLiveFetchForTest) {
  throw createApiError('upstream_unavailable', 'Test upstream failure');
}
```

- In detail fetching catch, use `getCachedContentById(contentId)` if available.

- [ ] **Step 4: Run GREEN**

Run: `npm run test --workspace=backend -- test/catalogCacheFallback.test.js`

Expected: PASS.

## Task 5: Manual Ingestion Refresh

**Files:**
- Create: `backend/src/services/ingestionService.js`
- Create: `backend/src/routes/ingestion.js`
- Modify: `backend/src/index.js`
- Create: `backend/test/ingestionService.test.js`

- [ ] **Step 1: Write failing ingestion test**

Create `backend/test/ingestionService.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { refreshContentType } from '../src/services/ingestionService.js';
import { listCachedContents } from '../src/repositories/contentRepository.js';

test('refreshContentType stores provided loader results and records source run', async () => {
  resetDatabaseForTest(':memory:');
  const result = await refreshContentType('anime', {
    loader: async () => ({
      list: [{
        id: 'anime:jikan:99', title: 'Manual Refresh Anime', cover: 'https://example.com/c.jpg',
        summary: 'Real loaded content.', type: 'anime', tags: [], actors: [], author: 'Jikan',
        ipName: 'Manual Refresh Anime', status: 'completed', hotScore: 99,
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z',
        source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/99' },
      }],
      pagination: { page: 1, limit: 1, total: 1 },
    }),
  });

  const cached = listCachedContents({ type: 'anime', page: 1, limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(cached.list[0].title, 'Manual Refresh Anime');
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/ingestionService.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement ingestion service and route**

Create `backend/src/services/ingestionService.js`:

```javascript
import { fetchListByType } from './catalogService.js';
import { upsertContents } from '../repositories/contentRepository.js';
import { recordSourceRun } from '../repositories/sourceRepository.js';
import { createApiError } from '../utils/apiErrors.js';

function sourceForType(type) {
  if (type === 'anime') return 'jikan';
  if (type === 'drama') return 'tvmaze';
  if (type === 'novel' || type === 'comic') return 'openlibrary';
  return 'unknown';
}

async function refreshContentType(type, { loader } = {}) {
  const startedAt = new Date().toISOString();
  const load = loader || (() => fetchListByType({ type, page: 1, limit: 20, sort: 'hot', __bypassCacheFallback: true }));

  try {
    const result = await load();
    const count = upsertContents(result.list || []);
    recordSourceRun({ type, source: sourceForType(type), status: 'success', count, startedAt, finishedAt: new Date().toISOString() });
    return { type, source: sourceForType(type), status: 'success', count };
  } catch (error) {
    recordSourceRun({ type, source: sourceForType(type), status: 'failed', count: 0, error: error.message, startedAt, finishedAt: new Date().toISOString() });
    if (error.publicCode) throw error;
    throw createApiError('upstream_unavailable', error.message || '刷新失败');
  }
}

export { refreshContentType, sourceForType };
```

Create `backend/src/routes/ingestion.js`:

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

Register in `backend/src/index.js`:

```javascript
import ingestionRoutes from './routes/ingestion.js';
app.use('/api/ingestion', ingestionRoutes);
```

- [ ] **Step 4: Run GREEN**

Run: `npm run test --workspace=backend -- test/ingestionService.test.js`

Expected: PASS.

## Task 6: Persistent User Repository

**Files:**
- Create: `backend/src/repositories/userRepository.js`
- Modify: `backend/src/services/userService.js`
- Create: `backend/test/userRepository.test.js`

- [ ] **Step 1: Write failing user persistence test**

Create `backend/test/userRepository.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createUser, addWatchHistory, getWatchHistoryIds, toggleFavoriteId, getFavoriteIds } from '../src/repositories/userRepository.js';

test('userRepository persists history and favorites', () => {
  resetDatabaseForTest(':memory:');
  const user = createUser('alice');
  addWatchHistory(user.id, 'anime:jikan:1');
  const fav = toggleFavoriteId(user.id, 'anime:jikan:1');

  assert.equal(fav.isFavorite, true);
  assert.deepEqual(getWatchHistoryIds(user.id).map(item => item.contentId), ['anime:jikan:1']);
  assert.deepEqual(getFavoriteIds(user.id), ['anime:jikan:1']);
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/userRepository.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement user repository and wire service**

Create `backend/src/repositories/userRepository.js` with `createUser`, `findUserById`, `findUserByUsername`, `addWatchHistory`, `getWatchHistoryIds`, `toggleFavoriteId`, `getFavoriteIds`.

Update `backend/src/services/userService.js` to use repository functions instead of the `users` array. Keep return shapes unchanged.

- [ ] **Step 4: Run GREEN**

Run: `npm run test --workspace=backend -- test/userRepository.test.js`

Expected: PASS.

## Task 7: Frontend Source Status UI

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/index.ts`
- Create: `frontend/src/components/SourceStatusBar.tsx`
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add frontend types and API**

Add `SourceStatus` and `stale/cachedAt` to response types. Add client functions:

```typescript
export function getSourceStatus(signal?: AbortSignal) {
  return fetchApi<SourceStatus[]>('/sources/status', {}, signal);
}

export function refreshContentType(type: string) {
  return fetchApi<{ type: string; source: string; status: string; count: number }>(`/ingestion/refresh?type=${encodeURIComponent(type)}`, { method: 'POST' });
}
```

- [ ] **Step 2: Add hook and component**

Create `SourceStatusBar.tsx` showing status, stale badge, last finished time, and refresh button.

- [ ] **Step 3: Wire Home**

Add status bar above category tabs. On refresh success increment retry key. When `contents[0]?.stale` or response stale is true, show cache warning.

- [ ] **Step 4: Run frontend checks**

Run: `npm run lint --workspace=frontend && npm run build`

Expected: PASS.

## Task 8: Full Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run backend tests**

Run: `npm run test --workspace=backend`

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run: `npm run lint --workspace=frontend`

Expected: PASS.

Run: `npm run build`

Expected: PASS. Record Tailwind/lightningcss warnings if present.

- [ ] **Step 3: API smoke**

Start backend and verify:

```bash
curl --noproxy '*' -sS http://127.0.0.1:3001/api/sources/status
curl --noproxy '*' -sS -X POST 'http://127.0.0.1:3001/api/ingestion/refresh?type=anime'
```

Expected: stable JSON. Refresh may return upstream error in restricted network, but records failed source run.

- [ ] **Step 4: Browser smoke**

Use Chrome headless to verify homepage includes source status UI and refresh action text.

## Self-Review

Spec coverage:

- SQLite auto-create: Task 1.
- Content cache: Task 2 and 4.
- Source runs/status: Task 3 and 5.
- Manual refresh: Task 5 and 7.
- User persistence: Task 6.
- Frontend status/stale UI: Task 7.
- Verification: Task 8.

Constraint:

- Do not run git commit, push, branch, reset, or destructive cleanup without explicit user request.
