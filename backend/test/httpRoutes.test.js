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

const cachedAnime = {
  id: 'anime:ai-search:1',
  title: 'Cached Anime',
  cover: 'https://example.com/cached.jpg',
  summary: 'Cached summary',
  type: 'anime',
  tags: ['Action'],
  actors: ['Studio A'],
  author: 'AI Discovery',
  ipName: 'Cached Anime',
  status: 'completed',
  hotScore: 900,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Trending Search', url: 'https://example.com/ai-anime-1' },
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
    const req = Readable.from(payload ? [payload] : []);
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

async function withIsolatedAiConfigEnv(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mediahub-ai-config-test-'));
  const envPath = path.join(tempDir, '.env');
  const previous = {
    MEDIAHUB_ENV_FILE_PATH: process.env.MEDIAHUB_ENV_FILE_PATH,
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
  };

  process.env.MEDIAHUB_ENV_FILE_PATH = envPath;
  delete process.env.MEDIAHUB_AI_ENABLED;
  delete process.env.MEDIAHUB_AI_MODEL;
  delete process.env.MEDIAHUB_AI_BASE_URL;
  delete process.env.MEDIAHUB_AI_API_KEY;

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
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

test('GET /api/health returns ok payload', async () => {
  const response = await requestJson('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'ok');
  assert.equal(typeof response.data.timestamp, 'string');
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

test('GET /admin redirects to frontend admin route', async () => {
  const client = createTestClient();
  const response = await client.request({
    pathname: '/admin',
    headers: { accept: 'application/json' },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, 'http://127.0.0.1:5174/admin');
});

test('GET /api/categories returns the four primary categories', async () => {
  const response = await requestJson('/api/categories');

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.data.data.map((item) => item.id),
    ['drama', 'novel', 'comic', 'anime'],
  );
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

test('user register -> me -> logout uses the session cookie contract', async () => {
  const client = createTestClient();

  const registerResponse = await client.request({
    method: 'POST',
    pathname: '/api/users/register',
    body: { username: 'alice' },
  });

  assert.equal(registerResponse.status, 200);
  assert.equal(registerResponse.data.code, 0);
  assert.equal(registerResponse.data.data.username, 'alice');

  const sessionCookie = firstCookieHeader(registerResponse);
  assert.match(sessionCookie, /^mediahub_session=[^;]+;/);
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /Path=\//i);
  assert.match(sessionCookie, /SameSite=Lax/i);

  const meResponse = await client.request({
    pathname: '/api/users/me',
    headers: { cookie: cookiePair(sessionCookie) },
  });

  assert.equal(meResponse.status, 200);
  assert.deepEqual(meResponse.data, {
    code: 0,
    data: registerResponse.data.data,
  });

  const logoutResponse = await client.request({
    method: 'POST',
    pathname: '/api/users/logout',
    headers: { cookie: cookiePair(sessionCookie) },
  });

  assert.equal(logoutResponse.status, 200);
  assert.deepEqual(logoutResponse.data, { code: 0, data: { loggedOut: true } });
  assert.match(firstCookieHeader(logoutResponse), /^mediahub_session=;/);

  const meAfterLogoutResponse = await client.request({
    pathname: '/api/users/me',
    headers: { cookie: cookiePair(firstCookieHeader(logoutResponse)) },
  });

  assert.equal(meAfterLogoutResponse.status, 200);
  assert.deepEqual(meAfterLogoutResponse.data, { code: 0, data: null });
});

test('GET /api/users/history returns 401 without a session cookie', async () => {
  const response = await requestJson('/api/users/history');

  assert.equal(response.status, 401);
  assert.match(response.headers['content-type'], /^application\/json\b/);
  assert.equal(response.data.code, 1004);
  assert.equal(response.data.error, 'unauthorized');
  assert.equal(response.data.message, 'Unauthorized');
  assert.equal(typeof response.data.requestId, 'string');
});

test('GET /api/contents reads database rows directly when cache exists', async () => {
  const client = createTestClient();
  upsertContents([cachedAnime]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: '/api/contents?type=anime&page=1&limit=10',
    });

    assert.equal(fetchMock.calls.length, 0);
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.stale, false);
    assert.equal(response.data.data.pagination.total, 1);
    assert.equal(response.data.data.list.length, 1);
    assert.equal(response.data.data.list[0].id, cachedAnime.id);
    assert.equal(response.data.data.list[0].title, cachedAnime.title);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/contents/:id reads database detail directly when cache exists', async () => {
  const client = createTestClient();
  upsertContents([cachedAnime]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: `/api/contents/${encodeURIComponent(cachedAnime.id)}`,
    });

    assert.equal(fetchMock.calls.length, 0);
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.id, cachedAnime.id);
    assert.equal(response.data.data.title, cachedAnime.title);
    assert.equal(response.data.data.stale, false);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/sources/status returns the latest source run per type', async () => {
  const client = createTestClient();

  recordSourceRun({ type: 'anime', source: 'ai_search', status: 'failed', count: 0, error: 'timeout' });
  recordSourceRun({ type: 'anime', source: 'ai_search', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'ai_search', status: 'failed', count: 3, error: 'rate_limited' });

  const response = await adminRequest(client, { pathname: '/api/sources/status' });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.deepEqual(response.data.data, [
    {
      type: 'anime',
      source: 'ai_search',
      status: 'success',
      count: 12,
      error: null,
      startedAt: response.data.data[0].startedAt,
      finishedAt: response.data.data[0].finishedAt,
    },
    {
      type: 'novel',
      source: 'ai_search',
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

test('GET /api/sources/health returns source routing runtime health snapshot', async () => {
  const previous = {
    MEDIAHUB_SOURCE_CHAIN_DRAMA: process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA,
    UPSTREAM_RETRY_MAX_ATTEMPTS: process.env.UPSTREAM_RETRY_MAX_ATTEMPTS,
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA = 'ai_search';
  process.env.UPSTREAM_RETRY_MAX_ATTEMPTS = '1';
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';

  const originalFetch = global.fetch;
  resetHttpServiceRuntimeState();
  resetSourceHealthRuntimeState();
  global.fetch = async (...args) => {
    const [url] = args;
    if (String(url).includes('example.com/v1/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [
            {
              title: 'AI Routing Health Drama',
              summary: 'health',
              tags: ['drama'],
              actors: ['actor-a'],
              author: 'ai',
              ipName: 'ai-health',
              status: 'ongoing',
              hotScore: 3200,
              sourceUrl: 'https://example.com/ai-health',
            },
          ],
        }) } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const client = createTestClient();
    const refreshResponse = await adminRequest(client, {
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });
    assert.equal(refreshResponse.status, 200);

    const healthResponse = await adminRequest(client, { pathname: '/api/sources/health?type=drama' });
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.data.code, 0);
    assert.ok(Array.isArray(healthResponse.data.data));
    assert.ok(healthResponse.data.data.some(item => item.type === 'drama' && item.source === 'ai_search'));
  } finally {
    global.fetch = originalFetch;
    resetHttpServiceRuntimeState();
    resetSourceHealthRuntimeState();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('GET /api/system/ai-config returns public config fields only', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/ai-config' });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal(typeof response.data.data.enabled, 'boolean');
  assert.equal(typeof response.data.data.model, 'string');
  assert.equal(typeof response.data.data.baseUrl, 'string');
  assert.equal(typeof response.data.data.hasApiKey, 'boolean');
  assert.equal('apiKey' in response.data.data, false);
});

test('PUT /api/system/ai-config updates and persists runtime config', async () => {
  await withIsolatedAiConfigEnv(async () => {
    const client = createTestClient();
    const updateResponse = await adminRequest(client, {
      method: 'PUT',
      pathname: '/api/system/ai-config',
      body: {
        enabled: true,
        model: 'gpt-5-mini-test',
        baseUrl: 'https://example.com/v1/',
        apiKey: 'sk-test',
      },
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.data.code, 0);
    assert.equal(updateResponse.data.data.model, 'gpt-5-mini-test');
    assert.equal(updateResponse.data.data.baseUrl, 'https://example.com/v1');
    assert.equal(updateResponse.data.data.hasApiKey, true);
    assert.equal('apiKey' in updateResponse.data.data, false);

    const readResponse = await adminRequest(client, { pathname: '/api/system/ai-config' });
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.data.code, 0);
    assert.equal(readResponse.data.data.enabled, true);
    assert.equal(readResponse.data.data.model, 'gpt-5-mini-test');
    assert.equal(readResponse.data.data.baseUrl, 'https://example.com/v1');
    assert.equal(readResponse.data.data.hasApiKey, true);
    assert.equal(readResponse.data.data.source.apiKey, 'runtime');
    assert.equal('apiKey' in readResponse.data.data, false);
  });
});

test('PUT /api/system/ai-config normalizes pasted inference endpoint URLs to base URL', async () => {
  await withIsolatedAiConfigEnv(async () => {
    const client = createTestClient();
    const updateResponse = await adminRequest(client, {
      method: 'PUT',
      pathname: '/api/system/ai-config',
      body: {
        enabled: true,
        model: 'gpt-5-mini-test',
        baseUrl: 'https://example.com/v1/chat/completions/',
        apiKey: 'sk-test',
      },
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.data.code, 0);
    assert.equal(updateResponse.data.data.baseUrl, 'https://example.com/v1');
  });
});

test('PUT /api/system/ai-config persists env config to configured env file', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mediahub-ai-env-'));
  const envPath = path.join(tempDir, '.env');
  const previous = {
    MEDIAHUB_ENV_FILE_PATH: process.env.MEDIAHUB_ENV_FILE_PATH,
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
  };

  process.env.MEDIAHUB_ENV_FILE_PATH = envPath;
  delete process.env.MEDIAHUB_AI_ENABLED;
  delete process.env.MEDIAHUB_AI_MODEL;
  delete process.env.MEDIAHUB_AI_BASE_URL;
  delete process.env.MEDIAHUB_AI_API_KEY;

  try {
    const client = createTestClient();
    const updateResponse = await adminRequest(client, {
      method: 'PUT',
      pathname: '/api/system/ai-config',
      body: {
        enabled: true,
        model: 'gpt-5-mini-env',
        baseUrl: 'https://env.example.com/v1/chat/completions',
        apiKey: 'sk-env-test',
        persistTarget: 'env',
      },
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.data.code, 0);
    assert.equal(updateResponse.data.data.persistedTo, 'env');
    assert.equal(updateResponse.data.data.envFilePath, envPath);
    assert.equal(updateResponse.data.data.model, 'gpt-5-mini-env');
    assert.equal(updateResponse.data.data.baseUrl, 'https://env.example.com/v1');
    assert.equal(updateResponse.data.data.hasApiKey, true);
    assert.equal(updateResponse.data.data.source.model, 'env');
    assert.equal('apiKey' in updateResponse.data.data, false);

    const envText = await readFile(envPath, 'utf8');
    assert.match(envText, /MEDIAHUB_AI_ENABLED="true"/);
    assert.match(envText, /MEDIAHUB_AI_MODEL="gpt-5-mini-env"/);
    assert.match(envText, /MEDIAHUB_AI_BASE_URL="https:\/\/env\.example\.com\/v1"/);
    assert.match(envText, /MEDIAHUB_AI_API_KEY="sk-env-test"/);

    const readResponse = await adminRequest(client, { pathname: '/api/system/ai-config' });
    assert.equal(readResponse.data.data.source.apiKey, 'env');
    assert.equal(readResponse.data.data.model, 'gpt-5-mini-env');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('PUT /api/system/ai-config rejects invalid payload types', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, {
    method: 'PUT',
    pathname: '/api/system/ai-config',
    body: { enabled: 'yes' },
  });

  assert.equal(response.status, 400);
  assert.equal(response.data.error, 'invalid_request');
});

test('GET /api/system/settings returns runtime system settings snapshot', async () => {
  const previous = {
    MEDIAHUB_AUTO_REFRESH_ENABLED: process.env.MEDIAHUB_AUTO_REFRESH_ENABLED,
    MEDIAHUB_AUTO_REFRESH_HOUR: process.env.MEDIAHUB_AUTO_REFRESH_HOUR,
    MEDIAHUB_AUTO_REFRESH_MINUTE: process.env.MEDIAHUB_AUTO_REFRESH_MINUTE,
    MEDIAHUB_AUTO_REFRESH_ON_STARTUP: process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP,
    MEDIAHUB_INGEST_BACKFILL_PAGES: process.env.MEDIAHUB_INGEST_BACKFILL_PAGES,
    MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE,
    MEDIAHUB_INGEST_BACKFILL_SORTS: process.env.MEDIAHUB_INGEST_BACKFILL_SORTS,
    CACHE_TTL_MS: process.env.CACHE_TTL_MS,
    UPSTREAM_TIMEOUT_MS: process.env.UPSTREAM_TIMEOUT_MS,
    UPSTREAM_RETRY_MAX_ATTEMPTS: process.env.UPSTREAM_RETRY_MAX_ATTEMPTS,
    UPSTREAM_RETRY_BASE_DELAY_MS: process.env.UPSTREAM_RETRY_BASE_DELAY_MS,
  };

  process.env.MEDIAHUB_AUTO_REFRESH_ENABLED = 'true';
  process.env.MEDIAHUB_AUTO_REFRESH_HOUR = '4';
  process.env.MEDIAHUB_AUTO_REFRESH_MINUTE = '30';
  process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP = 'false';
  process.env.MEDIAHUB_INGEST_BACKFILL_PAGES = '5';
  process.env.MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE = '50';
  process.env.MEDIAHUB_INGEST_BACKFILL_SORTS = 'hot,latest';
  process.env.CACHE_TTL_MS = '240000';
  process.env.UPSTREAM_TIMEOUT_MS = '15000';
  process.env.UPSTREAM_RETRY_MAX_ATTEMPTS = '3';
  process.env.UPSTREAM_RETRY_BASE_DELAY_MS = '400';

  try {
    const client = createTestClient();
    const response = await adminRequest(client, { pathname: '/api/system/settings' });

    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.autoRefresh.enabled, true);
    assert.equal(response.data.data.autoRefresh.hour, 4);
    assert.equal(response.data.data.autoRefresh.minute, 30);
    assert.equal(response.data.data.autoRefresh.runOnStartup, false);
    assert.equal(response.data.data.ingestBackfill.pages, 5);
    assert.equal(response.data.data.ingestBackfill.pageSize, 50);
    assert.deepEqual(response.data.data.ingestBackfill.sorts, ['hot', 'latest']);
    assert.equal(response.data.data.cache.ttlMs, 240000);
    assert.equal(response.data.data.cache.timeoutMs, 15000);
    assert.equal(response.data.data.cache.retryMaxAttempts, 3);
    assert.equal(response.data.data.cache.retryBaseDelayMs, 400);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('GET /api/system/settings filters and deduplicates ingest sort modes', async () => {
  const previous = process.env.MEDIAHUB_INGEST_BACKFILL_SORTS;
  process.env.MEDIAHUB_INGEST_BACKFILL_SORTS = 'hot,unknown,,latest,hot';

  try {
    const client = createTestClient();
    const response = await adminRequest(client, { pathname: '/api/system/settings' });

    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.deepEqual(response.data.data.ingestBackfill.sorts, ['hot', 'latest']);
  } finally {
    if (previous === undefined) {
      delete process.env.MEDIAHUB_INGEST_BACKFILL_SORTS;
    } else {
      process.env.MEDIAHUB_INGEST_BACKFILL_SORTS = previous;
    }
  }
});

test('GET /api/contents omits cover when MEDIAHUB_HIDE_COVER=true', async () => {
  const previous = process.env.MEDIAHUB_HIDE_COVER;
  process.env.MEDIAHUB_HIDE_COVER = 'true';
  const client = createTestClient();
  upsertContents([cachedAnime]);
  const fetchMock = mockFailingFetch();

  try {
    const listResponse = await client.request({
      pathname: '/api/contents?type=anime&page=1&limit=10',
    });
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.data.code, 0);
    assert.equal('cover' in listResponse.data.data.list[0], false);

    const detailResponse = await client.request({
      pathname: `/api/contents/${encodeURIComponent(cachedAnime.id)}`,
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

test('GET /api/system/settings no longer exposes platform source settings', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/settings' });
  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal('platformSource' in response.data.data, false);
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

test('system source routing only supports AI search and rejects platform API sources', async () => {
  const previous = {
    MEDIAHUB_SOURCE_CHAIN_DRAMA: process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA,
  };
  process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA = 'ai_search';

  try {
    const client = createTestClient();
    const snapshotResponse = await adminRequest(client, { pathname: '/api/system/source-routing' });
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshotResponse.data.code, 0);
    assert.deepEqual(snapshotResponse.data.data.supported.drama, ['ai_search']);
    assert.deepEqual(snapshotResponse.data.data.defaults.drama, ['ai_search']);
    assert.deepEqual(snapshotResponse.data.data.effective.drama, ['ai_search']);

    const rejectedResponse = await adminRequest(client, {
      method: 'PUT',
      pathname: '/api/system/source-routing',
      body: {
        type: 'drama',
        chain: ['tvmaze'],
      },
    });
    assert.equal(rejectedResponse.status, 400);
    assert.equal(rejectedResponse.data.error, 'invalid_request');
    assert.match(rejectedResponse.data.message, /ai_search/);

    const upsertResponse = await adminRequest(client, {
      method: 'PUT',
      pathname: '/api/system/source-routing',
      body: {
        type: 'drama',
        chain: ['ai_search'],
      },
    });
    assert.equal(upsertResponse.status, 200);
    assert.equal(upsertResponse.data.code, 0);
    assert.equal(upsertResponse.data.data.type, 'drama');
    assert.deepEqual(upsertResponse.data.data.chain, ['ai_search']);

    const clearResponse = await adminRequest(client, {
      method: 'DELETE',
      pathname: '/api/system/source-routing/drama',
    });
    assert.equal(clearResponse.status, 200);
    assert.equal(clearResponse.data.code, 0);
    assert.equal(clearResponse.data.data.type, 'drama');
    assert.deepEqual(clearResponse.data.data.chain, ['ai_search']);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('POST /api/ingestion/crawl is deprecated and returns 400', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, {
    method: 'POST',
    pathname: '/api/ingestion/crawl?type=drama&platform=douyin&page=1&limit=10&sort=hot',
    headers: { 'content-length': '0' },
  });

  assert.equal(response.status, 400);
  assert.equal(response.data.code, 1001);
  assert.equal(response.data.error, 'invalid_request');
  assert.match(response.data.message, /已废弃|refresh/);
});

test('POST /api/ingestion/refresh uses only AI search and never calls platform APIs', async () => {
  const previous = {
    MEDIAHUB_SOURCE_CHAIN_DRAMA: process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA,
    UPSTREAM_RETRY_MAX_ATTEMPTS: process.env.UPSTREAM_RETRY_MAX_ATTEMPTS,
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
    MEDIAHUB_AI_SEARCH_WEB_ENABLED: process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED,
  };
  process.env.MEDIAHUB_SOURCE_CHAIN_DRAMA = 'ai_search';
  process.env.UPSTREAM_RETRY_MAX_ATTEMPTS = '1';
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-test';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  process.env.MEDIAHUB_AI_SEARCH_WEB_ENABLED = 'false';

  const originalFetch = global.fetch;
  const calls = [];
  resetHttpServiceRuntimeState();
  resetSourceHealthRuntimeState();
  global.fetch = async (...args) => {
    const [url] = args;
    calls.push(String(url));
    if (String(url).includes('example.com/v1/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          items: [
            {
              title: 'AI Only Drama',
              summary: 'ai only',
              tags: ['drama'],
              actors: ['actor-a'],
              author: 'ai',
              ipName: 'ai-only',
              status: 'ongoing',
              hotScore: 5200,
              sourceUrl: 'https://example.com/ai-only-drama',
            },
          ],
        }) } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected platform API call: ${url}`);
  };

  try {
    const client = createTestClient();
    const response = await adminRequest(client, {
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.status, 'success');
    assert.equal(response.data.data.source, 'ai-search');
    assert.ok(calls.every(url => !/api\.tvmaze\.com|openlibrary\.org|api\.jikan\.moe/.test(url)));
  } finally {
    global.fetch = originalFetch;
    resetHttpServiceRuntimeState();
    resetSourceHealthRuntimeState();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('POST /api/ingestion/refresh returns 502 when AI search is unavailable', async () => {
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
  global.fetch = async (...args) => {
    const [url] = args;
    if (String(url).includes('example.com/v1/chat/completions')) {
      return new Response(JSON.stringify({ error: { message: 'server error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected platform API call: ${url}`);
  };

  try {
    const client = createTestClient();
    const response = await adminRequest(client, {
      method: 'POST',
      pathname: '/api/ingestion/refresh?type=drama',
      headers: { 'content-length': '0' },
    });

    assert.equal(response.status, 502);
    assert.equal(response.data.code, 2002);
    assert.equal(response.data.error, 'upstream_unavailable');
    assert.match(response.data.message, /AI 搜索失败|server error/i);
  } finally {
    global.fetch = originalFetch;
    resetHttpServiceRuntimeState();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test('admin content APIs create manual records and AI fill missing fields', async () => {
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

  assert.equal(createResponse.status, 200);
  assert.equal(createResponse.data.code, 0);
  assert.equal(createResponse.data.data.type, 'novel');
  assert.equal(createResponse.data.data.source.provider, 'manual');

  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
  };
  const originalFetch = global.fetch;
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-route-fill';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  global.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      summary: 'Route AI filled summary with enough length.',
      tags: ['Urban'],
      actors: ['Hero'],
      author: 'Route Author',
      ipName: 'Route IP',
      status: 'completed',
      hotScore: 4321,
    }) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const fillResponse = await adminRequest(client, {
      method: 'POST',
      pathname: `/api/system/admin-contents/${encodeURIComponent(createResponse.data.data.id)}/fill-missing`,
      headers: { 'content-length': '0' },
    });
    assert.equal(fillResponse.status, 200);
    assert.equal(fillResponse.data.code, 0);
    assert.equal(fillResponse.data.data.summary, 'Route AI filled summary with enough length.');
    assert.deepEqual(fillResponse.data.data.tags, ['Urban']);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
