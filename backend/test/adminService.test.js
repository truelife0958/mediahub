import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { recordSourceRun } from '../src/repositories/sourceRepository.js';
import {
  buildAdminSummary,
  resolveAdminSummary,
  getAdminLogs,
  getAdminQuality,
} from '../src/services/adminService.js';

const sample = {
  id: 'drama:hongguo:admin-1',
  title: 'Admin Drama',
  cover: 'https://example.com/c.jpg',
  summary: 'Admin quality summary.',
  type: 'drama',
  tags: ['Short Drama'],
  actors: ['Actor A'],
  author: 'Hongguo',
  ipName: 'Admin IP',
  status: 'completed',
  hotScore: 500,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'hongguo', label: 'Hongguo', url: 'https://www.hongguoduanju.com/' },
};

test('admin service summarizes cached content without legacy source controls', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);
  recordSourceRun({ type: 'drama', source: 'platform_hot', status: 'success', count: 1, error: null });

  const summary = buildAdminSummary();
  assert.equal(summary.totalContents, 1);
  assert.deepEqual(summary.countsByType, { drama: 1, novel: 0, anime: 0, comic: 0 });
  assert.equal(summary.runStats.totalRuns, 1);
  assert.equal(summary.runStats.successRate, 100);
  assert.equal(summary.quality.qualityScore, 100);
  assert.equal('routing' in summary, false);
  assert.equal('sourceHealth' in summary, false);
  assert.equal('aiConfig' in summary, false);
  assert.equal('cost' in summary, false);
});

test('admin service summarizes JSON-only datasets without legacy source controls', async () => {
  const previousDisabled = process.env.MEDIAHUB_DB_DISABLED;
  const previousDir = process.env.MEDIAHUB_JSON_DATA_DIR;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'mediahub-admin-json-'));

  try {
    process.env.MEDIAHUB_DB_DISABLED = 'true';
    process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
    await mkdir(path.join(dataDir, 'current'), { recursive: true });
    await writeFile(path.join(dataDir, 'current', 'drama.json'), JSON.stringify({
      date: '2026-06-25',
      capturedAt: '2026-06-25T00:00:00.000Z',
      items: [{
        id: 'drama:json:admin-1',
        title: 'JSON Admin Drama',
        cover: 'https://example.com/json.jpg',
        summary: 'JSON admin summary',
        type: 'drama',
        categories: ['复仇'],
        metrics: { totalScore: 8800 },
      }],
    }), 'utf8');

    const summary = await resolveAdminSummary();

    assert.equal(summary.totalContents, 1);
    assert.deepEqual(summary.countsByType, { drama: 1, novel: 0, anime: 0, comic: 0 });
    assert.equal('routing' in summary, false);
    assert.equal('sourceHealth' in summary, false);
  } finally {
    if (previousDisabled === undefined) delete process.env.MEDIAHUB_DB_DISABLED;
    else process.env.MEDIAHUB_DB_DISABLED = previousDisabled;
    if (previousDir === undefined) delete process.env.MEDIAHUB_JSON_DATA_DIR;
    else process.env.MEDIAHUB_JSON_DATA_DIR = previousDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('admin service no longer exports cached content editing helpers', async () => {
  const service = await import('../src/services/adminService.js');
  for (const name of ['listAdminContents', 'createAdminContent', 'updateAdminContent']) {
    assert.equal(name in service, false);
  }
});

test('admin quality and logs expose duplicate candidates and error categories', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([
    sample,
    { ...sample, id: 'drama:manual:admin-2', title: ' Admin Drama ', source: { provider: 'manual', label: 'Manual' } },
  ]);
  recordSourceRun({ type: 'drama', source: 'platform_hot', status: 'failed', count: 0, error: 'upstream timeout' });

  const quality = getAdminQuality();
  const logs = getAdminLogs({ limit: 10 });

  assert.equal(quality.duplicateCandidates.length, 1);
  assert.equal(logs.runs[0].category, '超时');
  assert.equal(logs.errorSummary['超时'], 1);
});

test('admin quality suggestions avoid AI wording in JSON-first mode', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([{
    ...sample,
    id: 'novel:manual:missing-fields',
    type: 'novel',
    title: '缺字段小说',
    summary: '',
    tags: [],
    source: { provider: 'manual', label: 'Manual' },
  }]);

  const quality = getAdminQuality();
  const suggestion = quality.reviewQueue.find(item => item.id === 'novel:manual:missing-fields')?.suggestion || '';

  assert.ok(suggestion);
  assert.doesNotMatch(suggestion, /AI|模型|Prompt/i);
  assert.match(suggestion, /平台|人工|补全/);
});

test('admin service no longer exports AI fill-missing helper', async () => {
  resetDatabaseForTest(':memory:');
  const service = await import('../src/services/adminService.js');
  assert.equal('fillMissingAdminContentWithAi' in service, false);
});
