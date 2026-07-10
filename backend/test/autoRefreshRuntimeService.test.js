import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackfillOptions,
  getAutoRefreshRuntimeStatus,
  refreshAllContentTypesNow,
  resetAutoRefreshRuntimeForTest,
  restartAutoRefreshRuntime,
  startAutoRefreshRuntime,
} from '../src/services/autoRefreshRuntimeService.js';

function withEnv(patch, fn) {
  const previous = Object.fromEntries(Object.keys(patch).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetAutoRefreshRuntimeForTest();
    });
}


test('default backend auto refresh targets 100 ranked rows per module', async () => {
  await withEnv({
    MEDIAHUB_INGEST_BACKFILL_PAGES: undefined,
    MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: undefined,
    MEDIAHUB_INGEST_BACKFILL_SORTS: undefined,
  }, async () => {
    assert.deepEqual(buildBackfillOptions(), { pageCount: 2, pageSize: 50, sortModes: ['hot'] });
  });
});

test('auto refresh runtime schedules from current system settings and restarts cleanly', async () => {
  await withEnv({
    MEDIAHUB_AUTO_REFRESH_ENABLED: 'true',
    MEDIAHUB_AUTO_REFRESH_MODE: 'interval',
    MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES: '5',
    MEDIAHUB_AUTO_REFRESH_ON_STARTUP: 'false',
    MEDIAHUB_INGEST_BACKFILL_PAGES: '2',
    MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: '11',
    MEDIAHUB_INGEST_BACKFILL_SORTS: 'hot,latest',
  }, async () => {
    const timers = [];
    const cleared = [];
    const now = new Date('2026-06-08T00:00:00.000Z');

    startAutoRefreshRuntime({
      nowProvider: () => now,
      setTimeoutFn(fn, delay) {
        const timer = { id: timers.length + 1, fn, delay };
        timers.push(timer);
        return timer;
      },
      clearTimeoutFn(timer) {
        cleared.push(timer);
      },
      logger: { info() {}, error() {} },
      runRefresh: async () => [],
    });

    const status = getAutoRefreshRuntimeStatus();
    assert.equal(status.started, true);
    assert.equal(status.enabled, true);
    assert.equal(status.mode, 'interval');
    assert.equal(status.scheduled, true);
    assert.equal(timers[0].delay, 300_000);
    assert.equal(status.nextRunAt, '2026-06-08T00:05:00.000Z');
    assert.deepEqual(status.backfill, { pageCount: 2, pageSize: 11, sortModes: ['hot', 'latest'] });

    process.env.MEDIAHUB_AUTO_REFRESH_ENABLED = 'false';
    const disabledStatus = restartAutoRefreshRuntime({
      nowProvider: () => now,
      setTimeoutFn() {
        throw new Error('disabled runtime must not schedule');
      },
      clearTimeoutFn(timer) {
        cleared.push(timer);
      },
      logger: { info() {}, error() {} },
    });

    assert.equal(disabledStatus.started, true);
    assert.equal(disabledStatus.enabled, false);
    assert.equal(disabledStatus.scheduled, false);
    assert.equal(cleared.length, 1);
  });
});

test('manual data refresh uses four visible modules with current backfill settings', async () => {
  await withEnv({
    MEDIAHUB_INGEST_BACKFILL_PAGES: '4',
    MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: '20',
    MEDIAHUB_INGEST_BACKFILL_SORTS: 'hot,latest',
  }, async () => {
    const calls = [];
    const data = await refreshAllContentTypesNow({
      trigger: 'manual-test',
      logger: { info() {}, error() {} },
      runRefresh: async ({ types, backfill }) => {
        calls.push({ types, backfill });
        return types.map(type => ({ type, status: 'success', count: 3 }));
      },
    });

    assert.deepEqual(calls[0].types, ['drama', 'novel', 'anime', 'comic']);
    assert.deepEqual(calls[0].backfill, { pageCount: 4, pageSize: 20, sortModes: ['hot', 'latest'] });
    assert.equal(data.results.length, 4);
    assert.equal(data.status.lastTrigger, 'manual-test');
    assert.equal(data.status.running, false);
  });
});
