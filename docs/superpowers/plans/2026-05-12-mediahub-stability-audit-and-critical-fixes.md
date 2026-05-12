# MediaHub Stability Audit and Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit MediaHub end-to-end on desktop and mobile, fix blocking defects with evidence-backed minimal patches, and leave a complete audit record for the follow-up cleanup and README work.

**Architecture:** First split backend app creation from process startup so HTTP contracts can be tested deterministically. Then add backend smoke coverage and an audit ledger, use those artifacts to drive API and browser investigation, and constrain each fix to the exact module that owns the failing behavior.

**Tech Stack:** Node.js 22, Express 4, node:sqlite, React 19, TypeScript, Vite 8, node:test, ESLint, Chrome/manual browser.

---

## File Structure

- Create: `backend/src/app.js` — Express app factory for tests and local startup.
- Modify: `backend/src/index.js` — process bootstrap only.
- Create: `backend/test/httpRoutes.test.js` — deterministic backend HTTP smoke coverage.
- Modify as needed: `backend/src/services/catalogService.js` — cached list/detail fallback and upstream normalization behavior.
- Modify as needed: `backend/src/services/httpService.js` — upstream timeout and response parsing behavior.
- Modify as needed: `backend/src/routes/users.js` — session cookie contract and unauthorized responses.
- Modify as needed: `backend/src/services/userService.js` — session-owned user flow behavior.
- Modify as needed: `backend/src/middleware/errorHandler.js` — stable JSON error envelope.
- Create: `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md` — audit ledger and validation evidence.
- Modify as needed: `frontend/src/api/client.ts` — client-side API resilience and response handling.
- Modify as needed: `frontend/src/api/UserContext.tsx` — login, history, favorite, refresh synchronization.
- Modify as needed: `frontend/src/pages/Home.tsx` — category/search/sort/refresh/list flow.
- Modify as needed: `frontend/src/pages/Detail.tsx` — detail load/error/action flow.
- Modify as needed: `frontend/src/pages/Profile.tsx` — login/profile/history/favorites flow.
- Modify as needed: `frontend/src/components/SearchBar.tsx` — search submit and clear behavior.
- Modify as needed: `frontend/src/components/SourceStatusBar.tsx` — source status / refresh / stale presentation.
- Modify as needed: `frontend/src/index.css` — responsive overflow, wrapping, tap target spacing.

> 不包含 `git commit` 步骤；当前工作区指令明确要求不主动规划提交与分支操作。

### Task 1: Make Backend Boot Testable

**Files:**
- Create: `backend/src/app.js`
- Modify: `backend/src/index.js`
- Test: `backend/test/httpRoutes.test.js`

- [ ] **Step 1: Write the failing smoke harness**

Create `backend/test/httpRoutes.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createApp } from '../src/app.js';

async function startServer() {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))),
  };
}

test('GET /api/health returns ok payload', async () => {
  resetDatabaseForTest(':memory:');
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.status, 'ok');
    assert.equal(typeof data.timestamp, 'string');
  } finally {
    await close();
  }
});

test('GET /api/categories returns the four primary categories', async () => {
  resetDatabaseForTest(':memory:');
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      data.data.map(item => item.id),
      ['drama', 'novel', 'comic', 'anime'],
    );
  } finally {
    await close();
  }
});

test('unknown routes return the JSON error envelope', async () => {
  resetDatabaseForTest(':memory:');
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/not-found`);
    const data = await response.json();

    assert.equal(response.status, 404);
    assert.equal(data.code, 1003);
    assert.equal(data.error, 'invalid_request');
  } finally {
    await close();
  }
});
```

Run: `npm test --workspace=backend -- test/httpRoutes.test.js`

Expected: FAIL with `Cannot find module '../src/app.js'`.

- [ ] **Step 2: Extract the app factory**

Create `backend/src/app.js`:

```javascript
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import contentRoutes from './routes/contents.js';
import recommendationRoutes from './routes/recommendations.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import sourceRoutes from './routes/sources.js';
import ingestionRoutes from './routes/ingestion.js';
import { initializeDatabase } from './db/database.js';

export function createApp() {
  initializeDatabase();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/contents', contentRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/sources', sourceRoutes);
  app.use('/api/ingestion', ingestionRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((_req, _res, next) => {
    const err = new Error('Not Found');
    err.statusCode = 404;
    err.code = 1003;
    next(err);
  });

  app.use(errorHandler);
  return app;
}
```

Modify `backend/src/index.js`:

```javascript
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const app = createApp();
app.listen(PORT, HOST, () => {
  console.log(`MediaHub API running on http://${HOST}:${PORT}`);
});

export default app;
```

- [ ] **Step 3: Verify the backend boot split**

Run: `npm test --workspace=backend -- test/httpRoutes.test.js`

Expected: PASS with `3` passing tests.

### Task 2: Add Deterministic Backend Session and Fallback Coverage

**Files:**
- Modify: `backend/test/httpRoutes.test.js`
- Modify as needed: `backend/src/services/catalogService.js`
- Modify as needed: `backend/src/routes/users.js`
- Modify as needed: `backend/src/services/userService.js`
- Modify as needed: `backend/src/middleware/errorHandler.js`

- [ ] **Step 1: Extend the smoke suite for session flow and cached fallback**

Append to `backend/test/httpRoutes.test.js`:

```javascript
import { recordSourceRun } from '../src/repositories/sourceRepository.js';
import { upsertContents } from '../src/repositories/contentRepository.js';

const cachedAnime = {
  id: 'anime:jikan:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cached.jpg',
  summary: 'Cached summary',
  type: 'anime',
  tags: ['Action'],
  actors: ['Studio A'],
  author: 'Jikan',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 900,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'jikan', label: 'Jikan', url: 'https://api.jikan.moe/v4/anime/1' },
};

function readCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

test('user register -> me -> logout uses the session cookie contract', async () => {
  resetDatabaseForTest(':memory:');
  const { baseUrl, close } = await startServer();

  try {
    const registerResponse = await fetch(`${baseUrl}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    });
    const registerData = await registerResponse.json();
    const cookie = readCookie(registerResponse);

    assert.equal(registerResponse.status, 200);
    assert.equal(registerData.data.username, 'alice');
    assert.match(cookie, /^mediahub_session=/);

    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: cookie },
    });
    const meData = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(meData.data.username, 'alice');

    const logoutResponse = await fetch(`${baseUrl}/api/users/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const logoutData = await logoutResponse.json();
    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutData.data.loggedOut, true);
  } finally {
    await close();
  }
});

test('GET /api/users/history returns 401 without a session cookie', async () => {
  resetDatabaseForTest(':memory:');
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/users/history`);
    const data = await response.json();

    assert.equal(response.status, 401);
    assert.equal(data.code, 1004);
    assert.equal(data.message, 'Unauthorized');
  } finally {
    await close();
  }
});

test('GET /api/contents falls back to cached rows when upstream fetch fails', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cachedAnime]);
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('/api/')) return originalFetch(url);
    throw new Error('offline');
  };
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/contents?type=anime`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.data.list.length, 1);
    assert.equal(data.data.list[0].id, cachedAnime.id);
    assert.equal(data.data.stale, true);
  } finally {
    global.fetch = originalFetch;
    await close();
  }
});

test('GET /api/contents/:id falls back to cached detail when upstream fetch fails', async () => {
  resetDatabaseForTest(':memory:');
  upsertContents([cachedAnime]);
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('/api/')) return originalFetch(url);
    throw new Error('offline');
  };
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/contents/${encodeURIComponent(cachedAnime.id)}`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.data.id, cachedAnime.id);
    assert.deepEqual(data.data.relatedContents, []);
    assert.deepEqual(data.data.similarContents, []);
  } finally {
    global.fetch = originalFetch;
    await close();
  }
});

test('GET /api/sources/status returns the latest source run per type', async () => {
  resetDatabaseForTest(':memory:');
  recordSourceRun({ type: 'anime', source: 'jikan', status: 'success', count: 12, error: null, startedAt: '2026-05-12T01:00:00.000Z', finishedAt: '2026-05-12T01:01:00.000Z' });
  recordSourceRun({ type: 'anime', source: 'jikan', status: 'failed', count: 0, error: 'rate limited', startedAt: '2026-05-12T02:00:00.000Z', finishedAt: '2026-05-12T02:01:00.000Z' });
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/sources/status`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].status, 'failed');
    assert.equal(data.data[0].error, 'rate limited');
  } finally {
    await close();
  }
});
```

Run: `npm test --workspace=backend -- test/httpRoutes.test.js`

Expected: PASS. If any new test fails, keep the failing assertion and patch only the owning backend module before moving on.

- [ ] **Step 2: Patch only the backend owner of each failing contract**

Use this ownership map when a Task 2 test fails:

```text
cached list/detail fallback  -> backend/src/services/catalogService.js
session cookie / auth guard  -> backend/src/routes/users.js
user-side content existence  -> backend/src/services/userService.js
JSON error envelope          -> backend/src/middleware/errorHandler.js
upstream timeout / rate      -> backend/src/services/httpService.js
```

Run after each patch:

```bash
npm test --workspace=backend -- test/httpRoutes.test.js
npm test --workspace=backend
```

Expected: targeted smoke tests PASS, then the full backend suite PASS.

### Task 3: Create the Audit Ledger and Capture the Baseline

**Files:**
- Create: `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`

- [ ] **Step 1: Create the audit ledger**

Create `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`:

```markdown
# MediaHub 稳定性审计记录

日期：2026-05-12

## 1. 基线命令

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm test --workspace=backend` | 待执行 |  |
| `npm run lint --workspace=frontend` | 待执行 |  |
| `npm run build --workspace=frontend` | 待执行 |  |

## 2. 后端问题

| 编号 | 优先级 | 接口 | 复现步骤 | 期望 | 实际 | 根因 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 3. 前端问题

| 编号 | 优先级 | 端别 | 页面/组件 | 复现步骤 | 期望 | 实际 | 根因 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 4. 外部依赖风险

| 编号 | 依赖 | 触发条件 | 项目侧兜底 | 状态 |
| --- | --- | --- | --- | --- |

## 5. 回归记录

| 修复项 | 验证命令/路径 | 结果 |
| --- | --- | --- |
```

- [ ] **Step 2: Run the baseline commands and write the first results**

Run:

```bash
npm test --workspace=backend
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected:

- `backend` tests: either all PASS or a deterministic list of failures to copy into section `1`.
- `frontend` lint/build: either PASS or deterministic failures to copy into section `1`.

- [ ] **Step 3: Record the first audit entries before fixing anything**

For every failure from Step 2, write one row into section `2` or `3` before editing code. Use exact command text, the failing URL or page, and the observed message.

### Task 4: Run Desktop and Mobile Browser Audit, Then Patch the Owning Frontend Modules

**Files:**
- Modify as needed: `frontend/src/api/client.ts`
- Modify as needed: `frontend/src/api/UserContext.tsx`
- Modify as needed: `frontend/src/pages/Home.tsx`
- Modify as needed: `frontend/src/pages/Detail.tsx`
- Modify as needed: `frontend/src/pages/Profile.tsx`
- Modify as needed: `frontend/src/components/SearchBar.tsx`
- Modify as needed: `frontend/src/components/SourceStatusBar.tsx`
- Modify as needed: `frontend/src/index.css`
- Update: `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`

- [ ] **Step 1: Start the local apps for browser audit**

Run in separate terminals or sessions:

```bash
npm run dev:backend
npm run dev:frontend
```

Expected:

- backend serves `http://127.0.0.1:3001`
- frontend serves the Vite local URL

- [ ] **Step 2: Execute the desktop + mobile walkthrough and log every issue before fixing**

Walk these paths in order and log each failure into section `3`:

```text
桌面端：首页 -> 分类切换 -> 搜索 -> 清除 -> 加载更多 -> 详情 -> 返回 -> 登录 -> 标记已看 -> 收藏 -> 个人中心 -> 历史/收藏切换
移动端：首页 -> 搜索输入 -> 分类横滑 -> 刷新来源 -> 详情操作按钮 -> 返回 -> 个人中心登录 -> 历史/收藏可读性
```

For every issue, log:

```text
编号 / 优先级 / 端别 / 页面或组件 / 复现步骤 / 期望 / 实际 / 根因 / 状态
```

- [ ] **Step 3: Patch only the owning frontend module for each confirmed P0/P1 issue**

Use this ownership map:

```text
接口报错、非 JSON 响应、超时提示      -> frontend/src/api/client.ts
登录、退出、历史、收藏状态不同步      -> frontend/src/api/UserContext.tsx
首页分类、搜索、排序、加载更多、刷新   -> frontend/src/pages/Home.tsx
搜索框提交/清除行为                   -> frontend/src/components/SearchBar.tsx
来源状态、刷新状态、stale 提示        -> frontend/src/components/SourceStatusBar.tsx
详情加载、返回、已看、收藏            -> frontend/src/pages/Detail.tsx
个人中心登录/历史/收藏切换            -> frontend/src/pages/Profile.tsx
移动端换行、溢出、按钮可点击面积      -> frontend/src/index.css
```

Before each fix, if the bug is API-contract related, first add or extend the nearest backend regression from Task 2. After each fix, append one row to section `5`.

- [ ] **Step 4: Apply the low-risk resilience patch set if the walkthrough confirms these cases**

If confirmed during Step 2, apply these exact changes:

```typescript
// frontend/src/api/client.ts
async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  if (!text) return { code: response.ok ? 0 : response.status, message: response.statusText };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(`Invalid API response: ${response.status} ${response.statusText}`, response.status);
  }
}
```

```typescript
// frontend/src/api/UserContext.tsx
const safeMessage = (error: unknown) => error instanceof Error ? error.message : '请求失败';
```

Use `safeMessage` consistently when `getCurrentUser`, `getWatchHistory`, and `getFavorites` fail so the audit can distinguish接口失败 from empty state.

- [ ] **Step 5: Re-run frontend verification after each fix batch**

Run:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Then rerun the exact browser path that failed.

Expected: the fixed path behaves correctly and section `5` gains a matching verification row.

### Task 5: Final Regression and Handoff

**Files:**
- Update: `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`

- [ ] **Step 1: Run the full final verification set**

Run:

```bash
npm test --workspace=backend
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

Expected: commands exit `0`. If any command fails, reopen the corresponding audit row and fix that failure before continuing.

- [ ] **Step 2: Re-run the complete user walkthrough once on desktop and once on mobile**

Walk exactly:

```text
首页 -> 分类切换 -> 搜索 -> 清除 -> 加载更多 -> 详情 -> 登录 -> 标记已看 -> 收藏 -> 个人中心 -> 返回首页确认状态同步
```

Expected:

- no unhandled page crash
- no blocking request failure
- no broken tap target on mobile
- history / favorites reflect the latest actions

- [ ] **Step 3: Close the audit ledger with a summary**

Add a final summary block to `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`:

```markdown
## 6. 总结

- 已修复：
- 未修复但已归档：
- 外部依赖风险：
- 下一步建议：
```

Only list items that have supporting evidence in sections `2` to `5`.
