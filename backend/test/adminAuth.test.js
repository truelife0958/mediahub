import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { resetDatabaseForTest } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { resetLoginRateLimit } from '../src/routes/admin.js';

const ADMIN_HEADERS = { origin: 'http://127.0.0.1:5174', 'x-mediahub-admin-action': 'true' };

function createMockResponse(resolve) {
  const chunks = [];
  const response = new EventEmitter();
  Object.assign(response, {
    statusCode: 200,
    headers: {},
    locals: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    removeHeader(name) { delete this.headers[name.toLowerCase()]; },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    },
    write(chunk) { if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))); },
    end(body) {
      if (body) this.write(body);
      this.emit('finish');
      resolve({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString() });
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
      ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload).toString() } : {}),
    };
    req.connection = {};
    req.socket = {};
    const res = createMockResponse((response) => {
      try { resolve({ ...response, data: response.body ? JSON.parse(response.body) : null }); }
      catch (error) { reject(error); }
    });
    res.req = req;
    app.handle(req, res, reject);
  });
}

function firstCookieHeader(response) {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header[0] : header;
}

function cookiePair(cookieHeader = '') {
  return String(cookieHeader).split(';', 1)[0];
}

function createTestClient() {
  resetDatabaseForTest(':memory:');
  resetLoginRateLimit();
  process.env.MEDIAHUB_ADMIN_PASSWORD = 'test-admin-secret';
  const app = createApp();
  return { request: options => sendRequest(app, options) };
}

test('admin APIs reject unauthenticated users', async () => {
  const client = createTestClient();

  for (const pathname of ['/api/system/json-data-status', '/api/sources/status']) {
    const response = await client.request({ pathname });
    assert.equal(response.status, 401, pathname);
    assert.equal(response.data.code, 1004);
    assert.equal(response.data.error, 'unauthorized');
  }
});


test('admin mutating APIs require trusted origin and admin action header', async () => {
  const client = createTestClient();

  const noHeader = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: 'test-admin-secret' },
  });
  assert.equal(noHeader.status, 401);
  assert.equal(noHeader.data.error, 'unauthorized');

  const badOrigin = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: { origin: 'https://evil.example', 'x-mediahub-admin-action': 'true' },
    body: { password: 'test-admin-secret' },
  });
  assert.equal(badOrigin.status, 401);
  assert.equal(badOrigin.data.error, 'unauthorized');
});

test('admin login sets httpOnly cookie and unlocks protected APIs', async () => {
  const client = createTestClient();

  const loginResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: 'test-admin-secret' },
  });

  assert.equal(loginResponse.status, 200);
  assert.deepEqual(loginResponse.data, { code: 0, data: { authenticated: true } });
  const cookie = firstCookieHeader(loginResponse);
  assert.match(cookie, /^mediahub_admin=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const statusResponse = await client.request({
    pathname: '/api/system/json-data-status',
    headers: { cookie: cookiePair(cookie) },
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.data.code, 0);
});



test('admin login rate limit returns a 429 API error after repeated failures', async () => {
  const client = createTestClient();

  for (let index = 0; index < 5; index += 1) {
    const response = await client.request({
      method: 'POST',
      pathname: '/api/admin/login',
      headers: ADMIN_HEADERS,
      body: { password: 'wrong' },
    });
    assert.equal(response.status, 401, `failed login ${index + 1} should still be an auth error`);
  }

  const limitedResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: 'wrong' },
  });
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.data.code, 1005);
  assert.equal(limitedResponse.data.error, 'rate_limited');
});

test('successful admin logins do not consume failed-login rate limit budget', async () => {
  const client = createTestClient();

  for (let index = 0; index < 6; index += 1) {
    const loginResponse = await client.request({
      method: 'POST',
      pathname: '/api/admin/login',
      headers: ADMIN_HEADERS,
      body: { password: 'test-admin-secret' },
    });
    assert.equal(loginResponse.status, 200, `successful login ${index + 1} should not be rate limited`);
  }

  const wrongResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: 'wrong' },
  });
  assert.equal(wrongResponse.status, 401);
  assert.equal(wrongResponse.data.error, 'unauthorized');
});

test('admin login rejects wrong password and logout clears session', async () => {
  const client = createTestClient();

  const wrongResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: 'wrong' },
  });
  assert.equal(wrongResponse.status, 401);
  assert.equal(wrongResponse.data.error, 'unauthorized');

  const loginResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: 'test-admin-secret' },
  });
  const cookie = firstCookieHeader(loginResponse);

  const logoutResponse = await client.request({
    method: 'POST',
    pathname: '/api/admin/logout',
    headers: { ...ADMIN_HEADERS, cookie: cookiePair(cookie) },
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(firstCookieHeader(logoutResponse), /^mediahub_admin=;/);

  const meResponse = await client.request({
    pathname: '/api/admin/me',
    headers: { cookie: cookiePair(firstCookieHeader(logoutResponse)) },
  });
  assert.equal(meResponse.status, 200);
  assert.deepEqual(meResponse.data, { code: 0, data: { authenticated: false } });
});
