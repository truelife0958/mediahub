import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { recordSourceRun } from '../src/repositories/sourceRepository.js';

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

function createMockResponse(resolve) {
  const chunks = [];

  return {
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
      resolve({
        status: this.statusCode,
        headers: this.headers,
        body: Buffer.concat(chunks).toString(),
      });
    },
  };
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

test('GET /api/categories returns the four primary categories', async () => {
  const response = await requestJson('/api/categories');

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.data.data.map((item) => item.id),
    ['drama', 'novel', 'comic', 'anime'],
  );
});

test('unknown routes return the JSON error envelope', async () => {
  const response = await requestJson('/api/not-found');

  assert.equal(response.status, 404);
  assert.match(response.headers['content-type'], /^application\/json\b/);
  assert.equal(response.data.code, 1003);
  assert.equal(response.data.error, 'invalid_request');
  assert.equal(response.data.message, 'Not Found');
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
  assert.deepEqual(response.data, {
    code: 1004,
    error: 'invalid_request',
    message: 'Unauthorized',
  });
});

test('GET /api/contents falls back to cached rows when upstream fetch fails', async () => {
  const client = createTestClient();
  upsertContents([cachedAnime]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: '/api/contents?type=anime&page=1&limit=10',
    });

    assert.equal(fetchMock.calls.length, 1);
    assert.match(String(fetchMock.calls[0][0]), /^https:\/\/api\.jikan\.moe\/v4\/top\/anime\?/);
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.stale, true);
    assert.equal(response.data.data.pagination.total, 1);
    assert.equal(response.data.data.list.length, 1);
    assert.equal(response.data.data.list[0].id, cachedAnime.id);
    assert.equal(response.data.data.list[0].title, cachedAnime.title);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/contents/:id falls back to cached detail when upstream fetch fails', async () => {
  const client = createTestClient();
  upsertContents([cachedAnime]);
  const fetchMock = mockFailingFetch();

  try {
    const response = await client.request({
      pathname: `/api/contents/${encodeURIComponent(cachedAnime.id)}`,
    });

    assert.equal(fetchMock.calls.length, 1);
    assert.equal(String(fetchMock.calls[0][0]), 'https://api.jikan.moe/v4/anime/1');
    assert.equal(response.status, 200);
    assert.equal(response.data.code, 0);
    assert.equal(response.data.data.id, cachedAnime.id);
    assert.equal(response.data.data.title, cachedAnime.title);
    assert.equal(response.data.data.stale, true);
  } finally {
    fetchMock.restore();
  }
});

test('GET /api/sources/status returns the latest source run per type', async () => {
  const client = createTestClient();

  recordSourceRun({ type: 'anime', source: 'jikan', status: 'failed', count: 0, error: 'timeout' });
  recordSourceRun({ type: 'anime', source: 'jikan', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'openlibrary', status: 'failed', count: 3, error: 'rate_limited' });

  const response = await client.request({ pathname: '/api/sources/status' });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.deepEqual(response.data.data, [
    {
      type: 'anime',
      source: 'jikan',
      status: 'success',
      count: 12,
      error: null,
      startedAt: response.data.data[0].startedAt,
      finishedAt: response.data.data[0].finishedAt,
    },
    {
      type: 'novel',
      source: 'openlibrary',
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
