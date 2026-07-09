import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resetDatabaseForTest } from '../src/db/database.js';
import { listContents, getContentById, resetCatalogRuntimeState } from '../src/services/catalogService.js';
import { refreshContentType } from '../src/services/ingestionService.js';
import { refreshHotDataset } from '../src/services/hotDatasetService.js';
import { readCurrentDataset } from '../src/store/jsonStore.js';

function makeSeed(title = '许你万丈光芒好') {
  return {
    id: 'drama:hongguo:xuniwanzhangguangmanghao',
    type: 'drama',
    title,
    source: 'hongguo',
    sourceName: '红果短剧',
    actors: ['马小宇', '余茵'],
    ipName: title,
    categories: ['真千金复仇'],
    summary: '短剧热榜数据。',
    metrics: { playOrReadYi: 10, platformHeatWan: 7445, searchIndex: 0, topicPlayYi: 3.2 },
    capturedAt: '2026-06-20T00:00:00.000Z',
  };
}

test('catalog service serves list and detail from JSON dataset before database fallback', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-catalog-'));
  const previousDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  resetCatalogRuntimeState();
  resetDatabaseForTest(':memory:');

  try {
    await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeSeed()],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    const result = await listContents({ type: 'drama', page: 1, limit: 10 });
    assert.equal(result.list.length, 1);
    assert.equal(result.list[0].source.provider, 'hongguo');
    assert.equal(result.resolvedSource, 'json_hot_dataset');

    const detail = await getContentById('drama:hongguo:xuniwanzhangguangmanghao');
    assert.equal(detail.title, '许你万丈光芒好');
    assert.deepEqual(detail.actors, ['马小宇', '余茵']);
  } finally {
    resetCatalogRuntimeState();
    if (previousDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshContentType persists loader results to JSON current dataset', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-ingest-'));
  const previousDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  resetDatabaseForTest(':memory:');

  try {
    const result = await refreshContentType('drama', {
      incremental: false,
      loader: async () => ({ list: [makeSeed('刷新写入短剧')] }),
    });

    assert.equal(result.count, 1);
    assert.equal(result.jsonDataset.count, 1);

    const listed = await listContents({ type: 'drama', keyword: '刷新写入', searchMode: 'local' });
    assert.equal(listed.pagination.total, 1);
    assert.equal(listed.list[0].title, '刷新写入短剧');
  } finally {
    if (previousDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('refreshContentType writes a daily crawl log JSON file', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-crawl-log-'));
  const previousDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  resetDatabaseForTest(':memory:');

  try {
    const result = await refreshContentType('drama', {
      incremental: false,
      loader: async () => ({ list: [makeSeed('日志写入短剧')] }),
    });

    const logText = await readFile(join(dataDir, 'logs', `crawl-${result.jsonDataset.date}.json`), 'utf8');
    const log = JSON.parse(logText);

    assert.equal(log.date, result.jsonDataset.date);
    assert.equal(log.runs.length, 1);
    assert.equal(log.runs[0].type, 'drama');
    assert.equal(log.runs[0].status, 'success');
    assert.equal(log.runs[0].count, 1);
    assert.equal(log.runs[0].jsonDataset.count, 1);
    assert.equal(log.runs[0].items[0].title, '日志写入短剧');
  } finally {
    if (previousDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});


test('refreshHotDataset preserves previous current dataset when refresh produces no valid rows', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-json-empty-fallback-'));

  try {
    await refreshHotDataset('drama', {
      dataDir,
      seeds: [makeSeed('Fallback Drama')],
      now: new Date('2026-06-20T08:00:00.000Z'),
    });

    const result = await refreshHotDataset('drama', {
      dataDir,
      seeds: [
        { id: 'broken', type: 'drama', title: '' },
      ],
      now: new Date('2026-06-21T08:00:00.000Z'),
    });

    const current = await readCurrentDataset('drama', { dataDir });
    const snapshotText = await readFile(join(dataDir, 'snapshots', '2026-06-21', 'drama.json'), 'utf8');
    const snapshot = JSON.parse(snapshotText);

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.count, 1);
    assert.equal(current.items.length, 1);
    assert.equal(current.items[0].title, 'Fallback Drama');
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].title, 'Fallback Drama');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
