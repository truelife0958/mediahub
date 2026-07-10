import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { resetDatabaseForTest } from '../../src/db/database.js';
import { createApp } from '../../src/app.js';
import { resetLoginRateLimit } from '../../src/routes/admin.js';

const ADMIN_HEADERS = { origin: 'http://127.0.0.1:5174', 'x-mediahub-admin-action': 'true' };

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
      ...(payload ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload).toString(),
      } : {}),
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
  resetLoginRateLimit();
  const app = createApp();
  return {
    request(options) {
      return sendRequest(app, options);
    },
  };
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
  assert.equal(response.status, 200);
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

function assertSuccessEnvelope(payload, label) {
  assert.equal(typeof payload, 'object', `${label}: payload must be object`);
  assert.equal(payload.code, 0, `${label}: code must be 0`);
  assert.ok('data' in payload, `${label}: data must exist`);
}

function assertErrorEnvelope(payload, expected) {
  assert.equal(typeof payload, 'object');
  assert.equal(payload.code, expected.code);
  assert.equal(payload.error, expected.error);
  assert.equal(payload.message, expected.message);
  assert.equal(typeof payload.requestId, 'string');
  assert.ok(payload.requestId.length > 0);
}

test('API contract: GET /api/categories success envelope', async () => {
  const client = createTestClient();
  const response = await client.request({ pathname: '/api/categories' });

  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'categories');
  assert.ok(Array.isArray(response.data.data));
  assert.equal(response.data.data.length, 4);
  assert.deepEqual(
    response.data.data.map(item => item.id),
    ['drama', 'novel', 'anime', 'comic'],
  );
});

test('API contract: GET /api/contents missing type error envelope', async () => {
  const client = createTestClient();
  const response = await client.request({ pathname: '/api/contents?page=1&limit=10' });

  assert.equal(response.status, 400);
  assertErrorEnvelope(response.data, {
    code: 1001,
    error: 'invalid_request',
    message: 'Invalid content type',
  });
});


test('API contract: public content query validation rejects unsafe parameters', async () => {
  const client = createTestClient();
  const longKeyword = encodeURIComponent('?'.repeat(81));
  const cases = [
    ['/api/contents?type=drama&keyword=' + longKeyword, 'keyword must be 80 characters or fewer'],
    ['/api/contents?type=drama&page=1001', 'page must be between 1 and 1000'],
    ['/api/contents?type=drama&limit=51', 'limit must be between 1 and 50'],
    ['/api/contents?type=drama&page=0', 'page must be between 1 and 1000'],
    ['/api/contents?type=drama&sort=random', 'Invalid sort'],
    ['/api/contents/discover/grouped?keyword=' + longKeyword, 'keyword must be 80 characters or fewer'],
  ];

  for (const [pathname, message] of cases) {
    const response = await client.request({ pathname });
    assert.equal(response.status, 400, pathname);
    assertErrorEnvelope(response.data, {
      code: 1001,
      error: 'invalid_request',
      message,
    });
  }
});

test('API contract: user-space routes are offline', async () => {
  const client = createTestClient();
  const response = await client.request({ pathname: '/api/users/history' });

  assert.equal(response.status, 404);
  assertErrorEnvelope(response.data, {
    code: 1002,
    error: 'not_found',
    message: 'Not Found',
  });
});

test('API contract: complex admin management routes are offline', async () => {
  const client = createTestClient();
  const adminCookie = await loginAdmin(client);
  const retiredRoutes = [
    { method: 'GET', pathname: '/api/system/settings' },
    { method: 'PUT', pathname: '/api/system/settings', body: { autoRefresh: { enabled: false } } },
    { method: 'GET', pathname: '/api/system/search-aliases' },
    { method: 'POST', pathname: '/api/system/search-aliases', body: { canonicalKeyword: 'test' } },
    { method: 'GET', pathname: '/api/system/source-routing' },
    { method: 'PUT', pathname: '/api/system/source-routing', body: { type: 'drama', chain: ['platform_hot'] } },
    { method: 'GET', pathname: '/api/system/admin-contents?type=drama' },
    { method: 'POST', pathname: '/api/system/admin-contents', body: { type: 'drama', title: 'test' } },
    { method: 'GET', pathname: '/api/system/leaderboard-anomalies' },
    { method: 'POST', pathname: '/api/system/leaderboards/capture' },
    { method: 'GET', pathname: '/api/system/subscriptions' },
    { method: 'POST', pathname: '/api/system/subscriptions', body: { keyword: 'test' } },
    { method: 'GET', pathname: '/api/system/subscription-hits' },
    { method: 'GET', pathname: '/api/system/audit-logs' },
    { method: 'GET', pathname: '/api/system/content-revisions/drama%3Atest' },
    { method: 'GET', pathname: '/api/sources/health?type=drama' },
  ];

  for (const route of retiredRoutes) {
    const response = await client.request({
      ...route,
      headers: {
        ...(route.headers || {}),
        ...(!['GET', 'HEAD'].includes(String(route.method || 'GET').toUpperCase()) ? ADMIN_HEADERS : {}),
        cookie: adminCookie,
      },
    });
    assert.equal(response.status, 404, `${route.method} ${route.pathname}`);
    assertErrorEnvelope(response.data, {
      code: 1002,
      error: 'not_found',
      message: 'Not Found',
    });
  }
});

test('API contract: unknown route envelope', async () => {
  const client = createTestClient();
  const response = await client.request({ pathname: '/api/unknown-route' });

  assert.equal(response.status, 404);
  assertErrorEnvelope(response.data, {
    code: 1002,
    error: 'not_found',
    message: 'Not Found',
  });
});

test('API contract: GET /api/system/json-data-status envelope shape', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/json-data-status' });

  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'system/json-data-status');
  assert.ok(Array.isArray(response.data.data.types));
  assert.equal(typeof response.data.data.indexes.actor, 'number');
  assert.equal(typeof response.data.data.indexes.ip, 'number');
  assert.equal(typeof response.data.data.indexes.category, 'number');
});

test('API contract: GET /api/system/admin-summary envelope shape', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/admin-summary' });

  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'system/admin-summary');
  assert.equal(typeof response.data.data.totalContents, 'number');
  assert.equal(typeof response.data.data.countsByType, 'object');
  assert.ok(Array.isArray(response.data.data.sourceStatuses));
  assert.equal(typeof response.data.data.runStats.successRate, 'number');
});
