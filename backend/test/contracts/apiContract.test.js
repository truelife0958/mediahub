import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { resetDatabaseForTest } from '../../src/db/database.js';
import { createApp } from '../../src/app.js';

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
    ['drama', 'novel', 'comic', 'anime'],
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

test('API contract: GET /api/users/history unauthorized envelope', async () => {
  const client = createTestClient();
  const response = await client.request({ pathname: '/api/users/history' });

  assert.equal(response.status, 401);
  assertErrorEnvelope(response.data, {
    code: 1004,
    error: 'unauthorized',
    message: 'Unauthorized',
  });
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

test('API contract: GET /api/system/settings envelope shape', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/settings' });

  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'system/settings');
  assert.equal(typeof response.data.data.autoRefresh.enabled, 'boolean');
  assert.equal(typeof response.data.data.autoRefresh.failureBackoffEnabled, 'boolean');
  assert.equal(typeof response.data.data.autoRefresh.failureBackoffMultiplier, 'number');
  assert.equal(typeof response.data.data.autoRefresh.failureBackoffMaxMinutes, 'number');
  assert.equal(typeof response.data.data.ingestBackfill.pages, 'number');
  assert.ok(Array.isArray(response.data.data.ingestBackfill.sorts));
  assert.equal(typeof response.data.data.cache.ttlMs, 'number');
  assert.equal(typeof response.data.data.notifications.webhookEnabled, 'boolean');
  assert.equal(typeof response.data.data.notifications.webhookTimeoutMs, 'number');
  assert.equal(typeof response.data.data.sourceRouting, 'object');
  assert.ok(Array.isArray(response.data.data.sourceRouting.effective.drama));
});

test('API contract: GET /api/system/search-aliases envelope shape', async () => {
  const client = createTestClient();
  const response = await adminRequest(client, { pathname: '/api/system/search-aliases' });

  assert.equal(response.status, 200);
  assertSuccessEnvelope(response.data, 'system/search-aliases');
  assert.ok(Array.isArray(response.data.data));
});
