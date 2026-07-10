import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

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

function firstCookieHeader(response) {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header[0] : header;
}

function cookiePair(cookieHeader = '') {
  return String(cookieHeader).split(';', 1)[0];
}

async function loginAdmin(app) {
  const response = await sendRequest(app, {
    method: 'POST',
    pathname: '/api/admin/login',
    headers: ADMIN_HEADERS,
    body: { password: process.env.MEDIAHUB_ADMIN_PASSWORD || 'MediaHub@2026' },
  });
  assert.equal(response.status, 200);
  return cookiePair(firstCookieHeader(response));
}

test('JSON-only runtime serves hot datasets without creating a SQLite database', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mediahub-json-only-'));
  const dataDir = path.join(tempRoot, 'data');
  const dbPath = path.join(tempRoot, 'disabled.sqlite');
  const previous = {
    MEDIAHUB_DB_DISABLED: process.env.MEDIAHUB_DB_DISABLED,
    MEDIAHUB_DB_PATH: process.env.MEDIAHUB_DB_PATH,
    MEDIAHUB_JSON_DATA_DIR: process.env.MEDIAHUB_JSON_DATA_DIR,
    MEDIAHUB_JSON_DATASET_ENABLED: process.env.MEDIAHUB_JSON_DATASET_ENABLED,
  };

  process.env.MEDIAHUB_DB_DISABLED = 'true';
  process.env.MEDIAHUB_DB_PATH = dbPath;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  process.env.MEDIAHUB_JSON_DATASET_ENABLED = 'true';

  try {
    const [{ refreshHotDataset }, { createApp }] = await Promise.all([
      import('../src/services/hotDatasetService.js'),
      import('../src/app.js'),
    ]);

    await refreshHotDataset('drama', {
      dataDir,
      seeds: [{
        id: 'drama:hongguo:json-only',
        type: 'drama',
        title: 'JSON Only Drama',
        source: 'hongguo',
        sourceName: 'Hongguo',
        actors: ['Actor A'],
        ipName: 'JSON Only IP',
        categories: ['Test Category'],
        summary: 'JSON-only dataset item',
        metrics: {
          playOrReadYi: 1.2,
          platformHeat: 80,
          searchIndex: 70,
          topicScore: 60,
        },
      }],
      now: new Date('2026-06-24T08:00:00.000Z'),
    });

    const app = createApp();
    assert.equal(existsSync(dbPath), false);

    const listResponse = await sendRequest(app, {
      pathname: '/api/contents?type=drama&page=1&limit=10',
    });
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.data.data.resolvedSource, 'json_hot_dataset');
    assert.equal(listResponse.data.data.list[0].id, 'drama:hongguo:json-only');

    const discoveryResponse = await sendRequest(app, {
      pathname: '/api/contents/discover/grouped?keyword=JSON%20Only&page=1&limit=8&searchMode=hybrid',
    });
    assert.equal(discoveryResponse.status, 200);
    assert.equal(discoveryResponse.data.data.total, 1);
    assert.equal(discoveryResponse.data.data.groups.drama[0].id, 'drama:hongguo:json-only');
    assert.equal(existsSync(dbPath), false);

    const adminCookie = await loginAdmin(app);
    const statusResponse = await sendRequest(app, {
      pathname: '/api/system/json-data-status',
      headers: { cookie: adminCookie },
    });
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(
      statusResponse.data.data.types.map(item => [item.type, item.count]),
      [['drama', 1], ['novel', 0], ['anime', 0], ['comic', 0]],
    );

    const summaryResponse = await sendRequest(app, {
      pathname: '/api/system/admin-summary',
      headers: { cookie: adminCookie },
    });
    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.data.data.totalContents, 1);
    assert.deepEqual(summaryResponse.data.data.countsByType, { drama: 1, novel: 0, anime: 0, comic: 0 });

    const qualityResponse = await sendRequest(app, {
      pathname: '/api/system/admin-quality',
      headers: { cookie: adminCookie },
    });
    assert.equal(qualityResponse.status, 200);
    assert.equal(qualityResponse.data.data.total, 1);

    const logsResponse = await sendRequest(app, {
      pathname: '/api/system/admin-logs?limit=20',
      headers: { cookie: adminCookie },
    });
    assert.equal(logsResponse.status, 200);
    assert.deepEqual(logsResponse.data.data.runs, []);

    const sourceStatusResponse = await sendRequest(app, {
      pathname: '/api/sources/status',
      headers: { cookie: adminCookie },
    });
    assert.equal(sourceStatusResponse.status, 200);
    assert.deepEqual(sourceStatusResponse.data.data, []);
    assert.equal(existsSync(dbPath), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      const { resetDatabaseForTest } = await import('../src/db/database.js');
      resetDatabaseForTest(':memory:');
    } catch {
      // No database was opened, which is the expected JSON-only path.
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('JSON-only runtime refreshes target content into JSON without database writes', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mediahub-json-only-refresh-'));
  const dataDir = path.join(tempRoot, 'data');
  const dbPath = path.join(tempRoot, 'disabled-refresh.sqlite');
  const previous = {
    MEDIAHUB_DB_DISABLED: process.env.MEDIAHUB_DB_DISABLED,
    MEDIAHUB_DB_PATH: process.env.MEDIAHUB_DB_PATH,
    MEDIAHUB_JSON_DATA_DIR: process.env.MEDIAHUB_JSON_DATA_DIR,
    MEDIAHUB_JSON_DATASET_ENABLED: process.env.MEDIAHUB_JSON_DATASET_ENABLED,
    MEDIAHUB_INGEST_INCREMENTAL_ENABLED: process.env.MEDIAHUB_INGEST_INCREMENTAL_ENABLED,
  };

  process.env.MEDIAHUB_DB_DISABLED = 'true';
  process.env.MEDIAHUB_DB_PATH = dbPath;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  process.env.MEDIAHUB_JSON_DATASET_ENABLED = 'true';
  process.env.MEDIAHUB_INGEST_INCREMENTAL_ENABLED = 'false';

  try {
    const [{ refreshContentType }, { readCurrentDataset, readCrawlLog }] = await Promise.all([
      import('../src/services/ingestionService.js'),
      import('../src/store/jsonStore.js'),
    ]);

    const result = await refreshContentType('novel', {
      incremental: false,
      loader: async () => ({
        list: [{
          id: 'novel:fanqie:json-only-refresh',
          type: 'novel',
          title: 'JSON Only Novel',
          source: 'fanqie',
          sourceName: 'Fanqie',
          author: 'Author A',
          ipName: 'JSON Only Novel',
          categories: ['Test Category'],
          summary: 'JSON-only refresh item',
          metrics: {
            playOrReadYi: 2.5,
            platformHeat: 88,
            searchIndex: 76,
            topicScore: 61,
          },
        }],
      }),
    });

    assert.equal(result.status, 'success');
    assert.equal(result.count, 1);
    assert.equal(result.jsonDataset.count, 1);
    assert.equal(existsSync(dbPath), false);

    const dataset = await readCurrentDataset('novel', { dataDir });
    assert.equal(dataset.items[0].id, 'novel:fanqie:json-only-refresh');

    const log = await readCrawlLog(dataset.date, { dataDir });
    assert.equal(log.runs[0].type, 'novel');
    assert.equal(log.runs[0].status, 'success');
    assert.equal(log.runs[0].count, 1);
    assert.equal(existsSync(dbPath), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      const { resetDatabaseForTest } = await import('../src/db/database.js');
      resetDatabaseForTest(':memory:');
    } catch {
      // No database was opened, which is the expected JSON-only path.
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});
