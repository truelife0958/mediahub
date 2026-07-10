import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { recordSourceRun } from '../src/repositories/sourceRepository.js';
import { resetHttpServiceRuntimeState } from '../src/services/httpService.js';
import { resetCatalogRuntimeState } from '../src/services/catalogService.js';
import { resetSourceHealthRuntimeState, resetSourceRoutingRuntimeState } from '../src/services/sourceStrategyService.js';
import { resetAutoRefreshRuntimeForTest } from '../src/services/autoRefreshRuntimeService.js';
import {
  flushRefreshJobQueuePersistence,
  getRefreshJobQueueStatus,
  resetRefreshJobQueueForTest,
  setRefreshJobQueueRunnerForTest,
} from '../src/services/refreshJobQueueService.js';
import { resetLoginRateLimit } from '../src/routes/admin.js';

const ADMIN_HEADERS = { origin: 'http://127.0.0.1:5174', 'x-mediahub-admin-action': 'true' };

const cachedDrama = {
  id: 'drama:manual:cached-1',
  title: 'Cached Drama',
  cover: 'https://example.com/cached.jpg',
  summary: 'Cached summary',
  type: 'drama',
  tags: ['复仇'],
  actors: ['演员A'],
  author: '',
  ipName: 'Cached Drama',
  status: 'completed',
  hotScore: 900,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'manual', label: 'Manual', url: 'https://example.com/manual-drama-1' },
};

function createMockResponse(resolve) {
  const chunks = [];
  const response = new EventEmitter();

  Object.assign(response, {
    statusCode: 200,
    headers: {},
    locals: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete this.headers[name.toLowerCase()];
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    },
    write(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
    end(body) {
      if (body) this.write(body);
      this.emit('finish');
      resolve({
        status: this.statusCode,
        headers: this.headers,
        body: Buffer.concat(chunks).toString(),
      });
    },
  });

  return response;
}

async function sendRequest(app, { method = 'GET', pathname, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = pathname;
    req.headers = {
      ...headers,
      ...(payload
        ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload).toString(),
        }
        : {}),
    };
    req.connection = {};
    req.socket = {};

    const res = createMockResponse((response) => {
      try {
        resolve({
          ...response,
          data: response.body ? JSON.parse(response.body) : null,
        });
      } catch (error) {
        reject(error);
      }
    });
    res.req = req;

    app.handle(req, res, reject);
  });
}

function createTestClient() {
  resetDatabaseForTest(':memory:');
  resetCatalogRuntimeState();
  resetSourceHealthRuntimeState();
  resetSourceRoutingRuntimeState();
  resetHttpServiceRuntimeState();
  resetAutoRefreshRuntimeForTest();
  resetRefreshJobQueueForTest();
  resetLoginRateLimit();
  const app = createApp();

  return {
    app,
    request(options) {
      return sendRequest(app, options);
    },
  };
}

async function requestJson(pathname) {
  const client = createTestClient();
  return client.request({ pathname });
}

function firstCookieHeader(response) {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header[0] : header;
}

function cookiePair(cookieHeader = '') {
  return String(cookieHeader).split(';', 1)[0];
}


async function loginAdmin(client) {
  const response = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026' },
  });
  if (response.status !== 200) {
    throw new Error(`admin login failed: ${response.status} ${response.body}`);
  }
  return cookiePair(firstCookieHeader(response));
}

async function adminRequest(client, options) {
  const adminCookie = await loginAdmin(client);
  return client.request({
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(!['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase()) ? ADMIN_HEADERS : {}),
      cookie: [options.headers?.cookie, adminCookie].filter(Boolean).join('; '),
    },
  });
}

function mockFailingFetch() {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (...args) => {
    calls.push(args);
    throw new Error('simulated upstream outage');
  };

  return {
    calls,
    restore() {
      global.fetch = originalFetch;
    },
  };
}

function mockHtmlFetch(html) {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (...args) => {
    calls.push(args);
    return {
      ok: true,
      status: 200,
      async text() {
        return html;
      },
    };
  };

  return {
    calls,
    restore() {
      global.fetch = originalFetch;
    },
  };
}


async function waitFor(predicate, { timeoutMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for condition');
}

async function withTempJsonDataDir(fn) {
  const previous = process.env.MEDIAHUB_JSON_DATA_DIR;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'mediahub-http-json-'));
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  try {
    return await fn(dataDir);
  } finally {
    if (previous === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previous;
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('GET /api/health returns ok payload', async () => {
  const response = await requestJson('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'ok');
  assert.equal(typeof response.data.timestamp, 'string');
});

test('admin ingestion queue status route is protected and returns empty queue snapshot', async () => {
  const client = createTestClient();
  const guestResponse = await client.request({ pathname: '/api/ingestion/jobs' });
  assert.equal(guestResponse.status, 401);

  const response = await adminRequest(client, { pathname: '/api/ingestion/jobs' });
  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal(response.data.data.running, false);
  assert.equal(response.data.data.queueLength, 0);
  assert.equal(response.data.data.activeJob, null);
  assert.deepEqual(response.data.data.queuedJobs, []);
});

test('POST /api/ingestion/refresh-all-queued enqueues safe serial job and persists progress', async () => {
  await withTempJsonDataDir(async (dataDir) => {
    const calls = [];
    const client = createTestClient();
    setRefreshJobQueueRunnerForTest(async (type) => {
      calls.push(type);
      return { count: type === 'drama' ? 12 : 7, supplementalSignals: { count: 0, errors: [] } };
    });

    const response = await adminRequest(client, {
      method: 'POST',
      pathname: '/api/ingestion/refresh-all-queued',
      body: { types: ['drama', 'comic'], trigger: 'http-test' },
    });

    assert.equal(response.status, 202);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.job.trigger, 'http-test');
    assert.deepEqual(response.data.data.job.types, ['drama', 'comic']);

    const status = await waitFor(() => {
      const current = getRefreshJobQueueStatus();
      return current.recentJobs[0]?.status === 'success' ? current : null;
    });

    assert.deepEqual(calls, ['drama', 'comic']);
    assert.equal(status.recentJobs[0].progress.completed, 2);
    await flushRefreshJobQueuePersistence();
    const persisted = JSON.parse(await readFile(path.join(dataDir, 'logs', 'refresh-jobs.json'), 'utf8'));
    assert.equal(persisted.recentJobs[0].trigger, 'http-test');
  });
});

test('complex admin data-management routes are offline', async () => {
  const client = createTestClient();
  const routes = [
    { pathname: '/api/system/search-aliases' },
    { pathname: '/api/system/leaderboard-anomalies?type=drama&layer=overall' },
    { pathname: '/api/system/settings' },
    { pathname: '/api/sources/health?type=drama' },
  ];

  for (const route of routes) {
    const response = await adminRequest(client, route);
    assert.equal(response.status, 404, route.pathname);
    assert.equal(response.data.error, 'not_found');
  }
});

test('every response includes x-request-id header', async () => {
  const response = await requestJson('/api/health');
  assert.equal(typeof response.headers['x-request-id'], 'string');
  assert.ok(String(response.headers['x-request-id']).length > 0);
});

test('request logger writes structured entry with requestId and duration', async () => {
  const originalInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args.map(String).join(' '));

  try {
    await requestJson('/api/health');
  } finally {
    console.info = originalInfo;
  }

  const line = logs.find(item => item.includes('[http]'));
  assert.ok(line);
  const jsonPart = line.slice(line.indexOf('{'));
  const payload = JSON.parse(jsonPart);

  assert.equal(payload.method, 'GET');
  assert.equal(typeof payload.requestId, 'string');
  assert.equal(typeof payload.durationMs, 'number');
  assert.ok(payload.durationMs >= 0);
});

test('GET / returns API service guide payload', async () => {
  const response = await requestJson('/');

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal(response.data.data.service, 'MediaHub API');
  assert.equal(response.data.data.status, 'ok');
  assert.equal(response.data.data.health, '/api/health');
  assert.match(response.data.data.frontend, /^http:\/\/127\.0\.0\.1:\d+\/$/);
});

test('GET / reflects MEDIAHUB_FRONTEND_URL in payload', async () => {
  const previous = process.env.MEDIAHUB_FRONTEND_URL;
  process.env.MEDIAHUB_FRONTEND_URL = 'http://127.0.0.1:8888';

  try {
    const response = await requestJson('/');
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.frontend, 'http://127.0.0.1:8888/');
  } finally {
    if (previous === undefined) {
      delete process.env.MEDIAHUB_FRONTEND_URL;
    } else {
      process.env.MEDIAHUB_FRONTEND_URL = previous;
    }
  }
});

test('production startup rejects unsafe default security config', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MEDIAHUB_ADMIN_PASSWORD: process.env.MEDIAHUB_ADMIN_PASSWORD,
    MEDIAHUB_COOKIE_SECURE: process.env.MEDIAHUB_COOKIE_SECURE,
    MEDIAHUB_FRONTEND_URL: process.env.MEDIAHUB_FRONTEND_URL,
  };

  process.env.NODE_ENV = 'production';
  delete process.env.MEDIAHUB_ADMIN_PASSWORD;
  process.env.MEDIAHUB_COOKIE_SECURE = 'true';
  process.env.MEDIAHUB_FRONTEND_URL = 'https://mediahub.example.com';

  try {
    assert.throws(() => createTestClient(), /MEDIAHUB_ADMIN_PASSWORD/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('production startup accepts explicit secure config', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MEDIAHUB_ADMIN_PASSWORD: process.env.MEDIAHUB_ADMIN_PASSWORD,
    MEDIAHUB_COOKIE_SECURE: process.env.MEDIAHUB_COOKIE_SECURE,
    MEDIAHUB_FRONTEND_URL: process.env.MEDIAHUB_FRONTEND_URL,
  };

  process.env.NODE_ENV = 'production';
  process.env.MEDIAHUB_ADMIN_PASSWORD = 'MediaHub-Strong-Password-2026';
  process.env.MEDIAHUB_COOKIE_SECURE = 'true';
  process.env.MEDIAHUB_FRONTEND_URL = 'https://mediahub.example.com';

  try {
    const response = await requestJson('/api/health');
    assert.equal(response.status, 200);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('GET /admin redirects to frontend admin route', async () => {
  const client = createTestClient();
  const response = await client.request({
    pathname: '/admin',
    headers: { accept: 'application/json' },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, 'http://127.0.0.1:5174/admin');
});

test('GET /api/categories returns the four user-facing categories', async () => {
  const response = await requestJson('/api/categories');

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.data.data.map((item) => item.id),
    ['drama', 'novel', 'anime', 'comic'],
  );
});

test('GET /api/contents can seed and return all visible categories', async () => {
  const client = createTestClient();

  for (const type of ['drama', 'novel', 'anime', 'comic']) {
    const response = await client.request({
      pathname: `/api/contents?type=${type}&page=1&limit=3`,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.ok(response.data.data.list.length > 0, `${type} should have seeded contents`);
    assert.ok(response.data.data.list.every(item => item.type === type), `${type} list should only include matching content`);
  }
});

test('GET /api/contents returns 400 when type is missing', async () => {
  const response = await requestJson('/api/contents?page=1&limit=10');

  assert.equal(response.status, 400);
  assert.equal(response.data.code, 1001);
  assert.equal(response.data.error, 'invalid_request');
  assert.equal(response.data.message, 'Invalid content type');
  assert.equal(typeof response.data.requestId, 'string');
});

test('unknown routes return the JSON error envelope', async () => {
  const response = await requestJson('/api/not-found');

  assert.equal(response.status, 404);
  assert.match(response.headers['content-type'], /^application\/json\b/);
  assert.equal(response.data.code, 1002);
  assert.equal(response.data.error, 'not_found');
  assert.equal(response.data.message, 'Not Found');
  assert.equal(typeof response.data.requestId, 'string');
});

test('backend entry only boots the process without exporting app', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /export\s+default\s+app\s*;?/);
});

test('user space and recommendation APIs are offline in JSON-first data app mode', async () => {
  const client = createTestClient();

  for (const request of [
    { method: 'POST', pathname: '/api/users/register', body: { username: 'alice' } },
    { pathname: '/api/users/me' },
    { pathname: '/api/users/history' },
    { pathname: '/api/recommendations/for-you?type=drama' },
  ]) {
    const response = await client.request(request);
    assert.equal(response.status, 404, request.pathname);
    assert.equal(response.data.code, 1002);
    assert.equal(response.data.error, 'not_found');
    assert.equal(response.data.message, 'Not Found');
  }
});

test('retired multi-board and comparison APIs are offline in JSON-first data app mode', async () => {
  const client = createTestClient();

  for (const request of [
    { pathname: '/api/leaderboards?type=drama' },
    { pathname: '/api/leaderboards/layers' },
    { pathname: '/api/contents/topics/actor/%E9%A9%AC%E5%B0%8F%E5%AE%87?type=drama' },
    { pathname: '/api/contents/compare?ids=drama:manual:cached-1' },
  ]) {
    const response = await client.request(request);
    assert.equal(response.status, 404, request.pathname);
    assert.equal(response.data.code, 1002);
    assert.equal(response.data.error, 'not_found');
    assert.equal(response.data.message, 'Not Found');
  }
});

test('GET /api/contents returns anime and comic modules', async () => {
  const client = createTestClient();

  for (const type of ['anime', 'comic']) {
    const response = await client.request({
      pathname: `/api/contents?type=${type}&page=1&limit=3`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.list.length, 3);
    assert.ok(response.data.data.list.every(item => item.type === type));
  }
});

test('GET /api/contents reads database rows directly when cache exists', async () => {
  const client = createTestClient();
  upsertContents([cachedDrama]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: '/api/contents?type=drama&page=1&limit=10',
    });

    assert.equal(fetchMock.calls.length, 0);
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.stale, false);
    assert.equal(response.data.data.pagination.total, 1);
    assert.equal(response.data.data.list.length, 1);
    assert.equal(response.data.data.list[0].id, cachedDrama.id);
    assert.equal(response.data.data.list[0].title, cachedDrama.title);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/contents/:id reads database detail directly when cache exists', async () => {
  const client = createTestClient();
  upsertContents([cachedDrama]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: `/api/contents/${encodeURIComponent(cachedDrama.id)}`,
    });

    assert.equal(fetchMock.calls.length, 0);
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.id, cachedDrama.id);
    assert.equal(response.data.data.title, cachedDrama.title);
    assert.equal(response.data.data.stale, false);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/sources/status returns the latest source run per type', async () => {
  const client = createTestClient();

  recordSourceRun({ type: 'drama', source: 'platform_hot', status: 'failed', count: 0, error: 'timeout' });
  recordSourceRun({ type: 'drama', source: 'platform_hot', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'qidian', status: 'failed', count: 3, error: 'rate_limited' });

  const response = await adminRequest(client, { pathname: '/api/sources/status' });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.deepEqual(response.data.data, [
    {
      type: 'drama',
      source: 'platform_hot',
      status: 'success',
      count: 12,
      error: null,
      startedAt: response.data.data[0].startedAt,
      finishedAt: response.data.data[0].finishedAt,
    },
    {
      type: 'novel',
      source: 'qidian',
      status: 'failed',
      count: 3,
      error: 'rate_limited',
      startedAt: response.data.data[1].startedAt,
      finishedAt: response.data.data[1].finishedAt,
    },
  ]);
  assert.equal(typeof response.data.data[0].startedAt, 'string');
  assert.equal(typeof response.data.data[0].finishedAt, 'string');
});

test('GET /api/sources/health is offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/sources/health?type=drama' });

  assert.equal(response.status, 404);
  assert.equal(response.data.error, 'not_found');
});

test('AI config endpoints are offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const getResponse = await adminRequest(client, { pathname: '/api/system/ai-config' });
  const putResponse = await adminRequest(client, { method: 'PUT', pathname: '/api/system/ai-config', body: { enabled: true } });
  const testResponse = await adminRequest(client, { method: 'POST', pathname: '/api/system/ai-config/test', body: {} });

  assert.equal(getResponse.status, 404);
  assert.equal(putResponse.status, 404);
  assert.equal(testResponse.status, 404);
});

test('GET /api/system/settings is offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/settings' });

  assert.equal(response.status, 404);
  assert.equal(response.data.error, 'not_found');
});

test('PUT /api/system/settings is offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, {
    method: 'PUT',
    pathname: '/api/system/settings',
    body: {
      autoRefresh: { hour: 25 },
    },
  });

  assert.equal(response.status, 404);
  assert.equal(response.data.error, 'not_found');
});

test('reference prompt settings endpoints are offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const getResponse = await adminRequest(client, { pathname: '/api/system/reference-settings' });
  const putResponse = await adminRequest(client, { method: 'PUT', pathname: '/api/system/reference-settings', body: {} });

  assert.equal(getResponse.status, 404);
  assert.equal(putResponse.status, 404);
});

test('leaderboard subscription and capture endpoints are offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const createResponse = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/system/subscriptions',
    body: {
      keyword: '盛夏芬德拉',
      type: 'drama',
      channel: 'webhook',
      target: 'https://example.com/webhook/mediahub',
    },
  });
  const captureResponse = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/system/leaderboards/capture',
    body: {},
  });

  assert.equal(createResponse.status, 404);
  assert.equal(createResponse.data.error, 'not_found');
  assert.equal(captureResponse.status, 404);
  assert.equal(captureResponse.data.error, 'not_found');
});

test('GET /api/contents omits cover when MEDIAHUB_HIDE_COVER=true', async () => {
  const previous = process.env.MEDIAHUB_HIDE_COVER;
  process.env.MEDIAHUB_HIDE_COVER = 'true';
  const client = createTestClient();
  upsertContents([cachedDrama]);
  const fetchMock = mockFailingFetch();

  try {
    const listResponse = await client.request({
      pathname: '/api/contents?type=drama&page=1&limit=10',
    });
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.data.code, 0);
    assert.equal('cover' in listResponse.data.data.list[0], false);

    const detailResponse = await client.request({
      pathname: `/api/contents/${encodeURIComponent(cachedDrama.id)}`,
    });
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.data.code, 0);
    assert.equal('cover' in detailResponse.data.data, false);
  } finally {
    fetchMock.restore();
    if (previous === undefined) {
      delete process.env.MEDIAHUB_HIDE_COVER;
    } else {
      process.env.MEDIAHUB_HIDE_COVER = previous;
    }
  }
});

test('GET /api/system/auto-refresh/status returns runtime scheduler state', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/auto-refresh/status' });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal(typeof response.data.data.started, 'boolean');
  assert.equal(typeof response.data.data.enabled, 'boolean');
  assert.equal(typeof response.data.data.running, 'boolean');
  assert.equal(Array.isArray(response.data.data.lastResults), true);
  assert.ok(Array.isArray(response.data.data.backfill.sortModes));
  assert.ok(response.data.data.backfill.sortModes.includes('hot'));
});

test('GET /api/system/json-data-preview returns current JSON items and latest crawl log', async () => {
  const htmlFetch = mockHtmlFetch(`
    <a href="/detail/json-preview">JSON 预览短剧</a>
    <span>分类：复仇爽剧 · 主演：演员甲、演员乙</span>
    <span>播放 2.5亿 热度 7200万 话题播放 1.1亿</span>
  `);

  try {
    await withTempJsonDataDir(async () => {
      const client = createTestClient();
      const refreshResponse = await adminRequest(client, {
        method: 'POST',
        pathname: '/api/ingestion/refresh?type=drama',
        headers: { 'content-length': '0' },
      });
      assert.equal(refreshResponse.status, 200);

      const previewResponse = await adminRequest(client, {
        pathname: '/api/system/json-data-preview?type=drama&limit=3',
      });

      assert.equal(previewResponse.status, 200);
      assert.equal(previewResponse.data.code, 0);
      assert.equal(previewResponse.data.data.type, 'drama');
      assert.equal(previewResponse.data.data.count, 1);
      assert.match(previewResponse.data.data.items[0].title, /JSON\s*预览短剧/);
      assert.equal(previewResponse.data.data.latestLog.runs[0].type, 'drama');
      assert.equal(previewResponse.data.data.latestLog.runs[0].status, 'success');
    });
  } finally {
    htmlFetch.restore();
    resetHttpServiceRuntimeState();
  }
});

test('POST /api/ingestion/refresh-all updates four visible modules independently', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('offline platform source');
  };

  try {
    const client = createTestClient();
    const response = await adminRequest(client, {
      method: 'POST',
      pathname: '/api/ingestion/refresh-all',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.deepEqual(
      response.data.data.results.map(item => item.type),
      ['drama', 'novel', 'anime', 'comic'],
    );
    assert.ok(response.data.data.results.every(item => item.status === 'success'));
    assert.ok(response.data.data.results.every(item => item.count === 0));
    assert.equal(response.data.data.status.lastTrigger, 'manual-all');
    assert.equal(response.data.data.status.lastResults.length, 4);
  } finally {
    global.fetch = originalFetch;
  }
});

test('platform source CRUD endpoints are offline and return 404', async () => {
  const client = createTestClient();
  const listResponse = await adminRequest(client, { pathname: '/api/system/platform-sources' });
  assert.equal(listResponse.status, 404);
  assert.equal(listResponse.data.error, 'not_found');

  const upsertResponse = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/system/platform-sources',
    body: {
      type: 'drama',
      platform: 'kuaishou',
      label: 'kuaishou-drama',
      apiUrl: 'https://example.com/kuaishou-feed',
      enabled: true,
    },
  });
  assert.equal(upsertResponse.status, 404);
  assert.equal(upsertResponse.data.error, 'not_found');

  const deleteResponse = await adminRequest(client, {
    method: 'DELETE',
    pathname: '/api/system/platform-sources/1',
  });
  assert.equal(deleteResponse.status, 404);
  assert.equal(deleteResponse.data.error, 'not_found');
});

test('system source routing endpoints are offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const getResponse = await adminRequest(client, { pathname: '/api/system/source-routing' });
  const putResponse = await adminRequest(client, {
    method: 'PUT',
    pathname: '/api/system/source-routing',
    body: {
      type: 'drama',
      chain: ['platform_hot'],
    },
  });
  const deleteResponse = await adminRequest(client, {
    method: 'DELETE',
    pathname: '/api/system/source-routing/drama',
  });

  assert.equal(getResponse.status, 404);
  assert.equal(putResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
});

test('POST /api/ingestion/crawl is deprecated and returns 404', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/ingestion/crawl?type=drama&platform=douyin&page=1&limit=10&sort=hot',
    headers: { 'content-length': '0' },
  });

  assert.equal(response.status, 404);
});

test('POST /api/ingestion/refresh uses target platform crawler by default', async () => {
  const htmlFetch = mockHtmlFetch(`
    <a href="/detail/route-target">路由测试红果短剧</a>
    <span>复仇爽剧 · 霸总甜宠 · 主演：演员甲、演员乙</span>
    <span>播放 1.2亿 热度 6888万 点赞 200万 收藏 120万</span>
  `);

  try {
    await withTempJsonDataDir(async () => {
      const client = createTestClient();
      const response = await adminRequest(client, {
        method: 'POST',
        pathname: '/api/ingestion/refresh?type=drama',
        headers: { 'content-length': '0' },
      });

      const fetchUrls = htmlFetch.calls.map(([url]) => String(url));
      assert.equal(response.status, 200);
      assert.equal(response.data.code, 0);
      assert.equal(response.data.data.status, 'success');
      assert.equal(response.data.data.count, 1);
      assert.equal(response.data.data.source, 'hongguo');
      assert.ok(fetchUrls.some(url => url.includes('hongguoduanju.com')));
    });
  } finally {
    htmlFetch.restore();
    resetHttpServiceRuntimeState();
    resetSourceHealthRuntimeState();
  }
});

test('POST /api/ingestion/refresh ignores keyword and uses platform crawler', async () => {
  resetHttpServiceRuntimeState();
  const htmlFetch = mockHtmlFetch(`
    <a href="/detail/keyword-ignored">关键词刷新短剧</a>
    <span>主演：演员乙 热度 900万 播放 1.8亿</span>
  `);

  try {
    await withTempJsonDataDir(async () => {
      const client = createTestClient();
      const response = await adminRequest(client, {
        method: 'POST',
        pathname: '/api/ingestion/refresh?type=drama&keyword=Platform%20Failure',
        headers: { 'content-length': '0' },
      });

      assert.equal(response.status, 200);
      assert.equal(response.data.code, 0);
      assert.equal(response.data.data.source, 'hongguo');
      assert.equal(response.data.data.count, 1);
    });
  } finally {
    htmlFetch.restore();
    resetHttpServiceRuntimeState();
  }
});


test('admin content editing endpoints are offline in JSON-first data app mode', async () => {
  const client = createTestClient();
  const createResponse = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/system/admin-contents',
    body: {
      type: 'novel',
      title: 'Admin Manual Novel',
      summary: '',
      tags: [],
      hotScore: 0,
    },
  });
  const updateResponse = await adminRequest(client, {
    method: 'PUT',
    pathname: '/api/system/admin-contents/drama%3Amanual%3Alegacy',
    body: { title: 'Legacy Manual Update' },
  });

  assert.equal(createResponse.status, 404);
  assert.equal(createResponse.data.error, 'not_found');
  assert.equal(updateResponse.status, 404);
  assert.equal(updateResponse.data.error, 'not_found');
});
