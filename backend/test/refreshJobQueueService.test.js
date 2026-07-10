import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test, afterEach } from 'node:test';
import {
  enqueueRefreshAllContentTypesJob,
  flushRefreshJobQueuePersistence,
  getRefreshJobQueueStatus,
  resetRefreshJobQueueForTest,
} from '../src/services/refreshJobQueueService.js';

async function waitFor(predicate, { timeoutMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for refresh job queue condition');
}

afterEach(async () => {
  await flushRefreshJobQueuePersistence();
  resetRefreshJobQueueForTest();
  delete process.env.MEDIAHUB_JSON_DATA_DIR;
});

test('queued refresh jobs expose progress, run serially, and persist latest status', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mediahub-refresh-jobs-'));
  process.env.MEDIAHUB_JSON_DATA_DIR = dataDir;
  let releaseDrama;
  const dramaGate = new Promise(resolve => { releaseDrama = resolve; });
  const calls = [];

  const first = enqueueRefreshAllContentTypesJob({
    trigger: 'test-first',
    types: ['drama', 'novel'],
    logger: { info() {}, error() {} },
    refreshType: async (type) => {
      calls.push(type);
      if (type === 'drama') await dramaGate;
      return { count: type === 'drama' ? 11 : 22 };
    },
  });

  assert.equal(first.status, 'queued');

  await waitFor(() => {
    const status = getRefreshJobQueueStatus();
    return status.activeJob?.id === first.id
      && status.activeJob.status === 'running'
      && status.activeJob.currentType === 'drama';
  });

  const second = enqueueRefreshAllContentTypesJob({
    trigger: 'test-second',
    types: ['comic'],
    logger: { info() {}, error() {} },
    refreshType: async (type) => {
      calls.push(type);
      return { count: 33 };
    },
  });

  assert.notEqual(second.id, first.id);
  assert.equal(getRefreshJobQueueStatus().queueLength, 1);
  assert.deepEqual(calls, ['drama']);

  releaseDrama();

  await waitFor(() => {
    const status = getRefreshJobQueueStatus();
    const completed = status.recentJobs.filter(job => job.status === 'success');
    return completed.length === 2 && status.queueLength === 0 && !status.activeJob;
  });

  assert.deepEqual(calls, ['drama', 'novel', 'comic']);
  const finalStatus = getRefreshJobQueueStatus();
  const firstDone = finalStatus.recentJobs.find(job => job.id === first.id);
  const secondDone = finalStatus.recentJobs.find(job => job.id === second.id);
  assert.equal(firstDone.progress.completed, 2);
  assert.equal(firstDone.results[0].count, 11);
  assert.equal(secondDone.progress.completed, 1);

  await flushRefreshJobQueuePersistence();
  const persisted = JSON.parse(await readFile(join(dataDir, 'logs', 'refresh-jobs.json'), 'utf8'));
  assert.equal(persisted.queueLength, 0);
  assert.equal(persisted.recentJobs.some(job => job.id === first.id), true);

  await rm(dataDir, { recursive: true, force: true });
});

test('queued refresh job marks partial success when one module fails', async () => {
  enqueueRefreshAllContentTypesJob({
    trigger: 'test-partial',
    types: ['drama', 'comic'],
    logger: { info() {}, error() {} },
    refreshType: async (type) => {
      if (type === 'comic') throw new Error('comic source blocked');
      return { count: 8 };
    },
  });

  const status = await waitFor(() => {
    const current = getRefreshJobQueueStatus();
    return current.recentJobs[0]?.status === 'partial' ? current : null;
  });

  const job = status.recentJobs[0];
  assert.equal(job.progress.completed, 2);
  assert.equal(job.results.length, 2);
  assert.equal(job.results.find(item => item.type === 'comic').status, 'failed');
  assert.match(job.results.find(item => item.type === 'comic').error, /comic source blocked/);
});


test('queued refresh job marks failed when every module fails', async () => {
  enqueueRefreshAllContentTypesJob({
    trigger: 'test-all-failed',
    types: ['anime', 'comic'],
    logger: { info() {}, error() {} },
    refreshType: async (type) => {
      throw new Error(`${type} source blocked`);
    },
  });

  const status = await waitFor(() => {
    const current = getRefreshJobQueueStatus();
    return current.recentJobs[0]?.status === 'failed' ? current : null;
  });

  const job = status.recentJobs[0];
  assert.equal(job.progress.completed, 2);
  assert.equal(job.progress.failed, 2);
  assert.equal(job.currentStage, 'failed');
  assert.match(job.error, /2 module\(s\) failed/);
});
