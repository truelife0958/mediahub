import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  appendCrawlLog,
  getTodayKey,
  readCrawlLog,
  readCurrentDataset,
  resetJsonStoreLocksForTest,
  writeCurrentDataset,
  writeSnapshotDataset,
} from '../src/store/jsonStore.js';
import { refreshContentType, resetIngestionRefreshQueueForTest } from '../src/services/ingestionService.js';
import { listHotDatasetContents } from '../src/services/hotDatasetService.js';

async function withTempDataDir(fn) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mediahub-json-store-'));
  try {
    return await fn(path.join(tempRoot, 'data'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    resetJsonStoreLocksForTest();
    resetIngestionRefreshQueueForTest();
  }
}

test('crawl log concurrent appends keep every run and unique ids', async () => {
  await withTempDataDir(async (dataDir) => {
    const now = new Date('2026-07-09T10:00:00.000Z');
    const writes = Array.from({ length: 30 }, (_, index) => appendCrawlLog({
      type: 'drama',
      source: 'test',
      status: 'success',
      count: index + 1,
    }, { dataDir, now }));

    await Promise.all(writes);
    const log = await readCrawlLog(getTodayKey(now), { dataDir });
    assert.equal(log.runs.length, 30);
    assert.equal(new Set(log.runs.map(run => run.id)).size, 30);
    assert.deepEqual(log.runs.map(run => run.count).sort((a, b) => a - b), Array.from({ length: 30 }, (_, index) => index + 1));
  });
});

test('corrupt crawl log degrades to an empty recoverable log', async () => {
  await withTempDataDir(async (dataDir) => {
    const date = '2026-07-09';
    const logDir = path.join(dataDir, 'logs');
    await writeFile(path.join(logDir, 'placeholder'), '', { flag: 'w' }).catch(async () => {});
    await rm(path.join(logDir, 'placeholder'), { force: true }).catch(() => {});
    await import('node:fs/promises').then(({ mkdir }) => mkdir(logDir, { recursive: true }));
    await writeFile(path.join(logDir, `crawl-${date}.json`), '{bad json', 'utf8');

    const log = await readCrawlLog(date, { dataDir });
    assert.equal(log.date, date);
    assert.deepEqual(log.runs, []);
  });
});

test('concurrent current dataset writes always leave valid JSON', async () => {
  await withTempDataDir(async (dataDir) => {
    await Promise.all(Array.from({ length: 12 }, (_, index) => writeCurrentDataset('drama', {
      type: 'drama',
      date: '2026-07-09',
      capturedAt: new Date(2026, 6, 9, 10, index).toISOString(),
      items: [{ id: `drama:test:${index}`, type: 'drama', title: `item ${index}`, rank: index + 1, metrics: { totalScore: index + 1 } }],
    }, { dataDir })));

    const raw = await readFile(path.join(dataDir, 'current', 'drama.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
    const dataset = await readCurrentDataset('drama', { dataDir });
    assert.equal(dataset.type, 'drama');
    assert.equal(dataset.items.length, 1);
  });
});


test('corrupt current dataset falls back to latest snapshot without returning 500', async () => {
  await withTempDataDir(async (dataDir) => {
    const snapshotDataset = {
      type: 'drama',
      date: '2026-07-08',
      capturedAt: '2026-07-08T10:00:00.000Z',
      items: [{
        id: 'drama:test:snapshot',
        type: 'drama',
        title: 'Snapshot Drama',
        categories: ['??'],
        actors: [],
        characters: [],
        metrics: { totalScore: 88 },
        rankingEvidence: [],
        capturedAt: '2026-07-08T10:00:00.000Z',
      }],
    };
    await writeSnapshotDataset('drama', snapshotDataset, { dataDir, now: new Date('2026-07-08T10:00:00.000Z') });
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(dataDir, 'current'), { recursive: true }));
    await writeFile(path.join(dataDir, 'current', 'drama.json'), '{bad json', 'utf8');

    const result = await listHotDatasetContents({ type: 'drama', dataDir });
    assert.equal(result.list.length, 1);
    assert.equal(result.list[0].title, 'Snapshot Drama');
    assert.equal(result.datasetDate, '2026-07-08');
  });
});

test('duplicate refresh requests for the same type reuse one in-flight promise', async () => {
  await withTempDataDir(async (dataDir) => {
    const previous = {
      MEDIAHUB_JSON_DATA_DIR: process.env.MEDIAHUB_JSON_DATA_DIR,
      MEDIAHUB_JSON_DATASET_ENABLED: process.env.MEDIAHUB_JSON_DATASET_ENABLED,
      MEDIAHUB_DB_DISABLED: process.env.MEDIAHUB_DB_DISABLED,
    };
    process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
    process.env.MEDIAHUB_JSON_DATASET_ENABLED = 'true';
    process.env.MEDIAHUB_DB_DISABLED = 'true';
    let calls = 0;
    try {
      const loader = async () => {
        calls += 1;
        await new Promise(resolve => setTimeout(resolve, 25));
        return { list: [{
          id: 'drama:test:one',
          type: 'drama',
          title: 'Real test drama',
          source: { provider: 'test', label: 'Test Source', url: 'https://example.com' },
          hotScore: 10000,
          metrics: { totalScore: 90, playOrReadScore: 80, platformHeatScore: 70, searchIndexScore: 60, topicScore: 50 },
          rankingEvidence: [{ sourceName: 'Test Source', evidenceType: 'platform_rank', rank: 1, confidence: 0.9 }],
        }] };
      };
      const [first, second] = await Promise.all([
        refreshContentType('drama', { loader, signalLoader: async () => [] }),
        refreshContentType('drama', { loader, signalLoader: async () => [] }),
      ]);
      assert.equal(calls, 1);
      assert.equal(first.count, second.count);
      assert.equal(first.jsonDataset.count, 1);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
