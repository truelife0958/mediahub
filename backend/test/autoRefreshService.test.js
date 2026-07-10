import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffIntervalMinutes,
  computeNextRunAt,
  refreshAllTypes,
  startDailyAutoRefresh,
} from '../src/services/autoRefreshService.js';

test('computeNextRunAt uses same day when target time is later', () => {
  const now = new Date(2026, 4, 13, 1, 0, 0, 0);
  const next = computeNextRunAt(now, 3, 0);

  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 4);
  assert.equal(next.getDate(), 13);
  assert.equal(next.getHours(), 3);
  assert.equal(next.getMinutes(), 0);
});

test('computeNextRunAt moves to next day when target time is now or passed', () => {
  const now = new Date(2026, 4, 13, 3, 0, 0, 0);
  const next = computeNextRunAt(now, 3, 0);

  assert.equal(next.getDate(), 14);
  assert.equal(next.getHours(), 3);
  assert.equal(next.getMinutes(), 0);
});

test('computeBackoffIntervalMinutes grows with failures and caps at max', () => {
  assert.equal(computeBackoffIntervalMinutes({
    baseIntervalMinutes: 5,
    failureCount: 0,
    failureBackoffEnabled: true,
    failureBackoffMultiplier: 2,
    failureBackoffMaxMinutes: 60,
  }), 5);

  assert.equal(computeBackoffIntervalMinutes({
    baseIntervalMinutes: 5,
    failureCount: 2,
    failureBackoffEnabled: true,
    failureBackoffMultiplier: 2,
    failureBackoffMaxMinutes: 60,
  }), 20);

  assert.equal(computeBackoffIntervalMinutes({
    baseIntervalMinutes: 10,
    failureCount: 4,
    failureBackoffEnabled: true,
    failureBackoffMultiplier: 3,
    failureBackoffMaxMinutes: 45,
  }), 45);
});

test('refreshAllTypes runs each type and collects failures', async () => {
  const calls = [];
  const errors = [];

  const result = await refreshAllTypes({
    types: ['drama', 'novel', 'anime', 'comic'],
    refreshType: async (type) => {
      calls.push(type);
      if (type === 'novel') throw new Error('upstream timeout');
      return { count: 7 };
    },
    logger: {
      error(message) {
        errors.push(message);
      },
    },
  });

  assert.deepEqual(calls, ['drama', 'novel', 'anime', 'comic']);
  assert.equal(result.length, 4);
  assert.equal(result[0].type, 'drama');
  assert.equal(result[0].status, 'success');
  assert.equal(result[0].count, 7);
  assert.equal(result[1].type, 'novel');
  assert.equal(result[1].status, 'failed');
  assert.equal(result[1].count, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /novel/);
});

test('refreshAllTypes defaults to the four user-facing modules', async () => {
  const calls = [];

  await refreshAllTypes({
    refreshType: async (type) => {
      calls.push(type);
      return { count: 1 };
    },
    logger: { error() {} },
  });

  assert.deepEqual(calls, ['drama', 'novel', 'anime', 'comic']);
});

test('refreshAllTypes forwards backfill options to refreshType', async () => {
  const received = [];

  await refreshAllTypes({
    types: ['novel'],
    refreshType: async (type, options) => {
      received.push({ type, options });
      return { count: 2 };
    },
    logger: { error() {} },
    backfill: {
      pageCount: 4,
      pageSize: 20,
      sortModes: ['hot', 'latest'],
    },
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'novel');
  assert.deepEqual(received[0].options, {
    pageCount: 4,
    pageSize: 20,
    sortModes: ['hot', 'latest'],
  });
});

test('startDailyAutoRefresh does not schedule when disabled', () => {
  let scheduled = false;

  const stop = startDailyAutoRefresh({
    enabled: false,
    setTimeoutFn() {
      scheduled = true;
      return 1;
    },
    logger: { info() {}, error() {} },
  });

  assert.equal(scheduled, false);
  stop();
});

test('startDailyAutoRefresh runs once on startup by default', async () => {
  let runCount = 0;
  let scheduled = 0;

  const stop = startDailyAutoRefresh({
    enabled: true,
    runOnStartup: true,
    mode: 'daily',
    hour: 3,
    minute: 0,
    nowProvider: () => new Date(2026, 4, 13, 1, 0, 0, 0),
    setTimeoutFn() {
      scheduled += 1;
      return 1;
    },
    clearTimeoutFn() {},
    logger: { info() {}, error() {} },
    runRefresh: async () => {
      runCount += 1;
      return [{ type: 'drama', status: 'success', count: 1 }];
    },
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runCount, 1);
  assert.equal(scheduled, 1);
  stop();
});

test('startDailyAutoRefresh schedules once and reschedules after run', async () => {
  const nowQueue = [
    new Date(2026, 4, 13, 1, 0, 0, 0),
    new Date(2026, 4, 13, 3, 0, 1, 0),
  ];
  const timers = [];
  const cleared = [];
  let runCount = 0;

  const stop = startDailyAutoRefresh({
    enabled: true,
    runOnStartup: false,
    mode: 'daily',
    hour: 3,
    minute: 0,
    nowProvider: () => nowQueue.shift() || new Date(2026, 4, 13, 3, 0, 1, 0),
    setTimeoutFn(fn, delay) {
      const timer = { id: timers.length + 1, fn, delay };
      timers.push(timer);
      return timer.id;
    },
    clearTimeoutFn(id) {
      cleared.push(id);
    },
    logger: { info() {}, error() {} },
    runRefresh: async () => {
      runCount += 1;
      return [{ type: 'drama', status: 'success', count: 1 }];
    },
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 7_200_000);

  await timers[0].fn();

  assert.equal(runCount, 1);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 86_399_000);

  stop();
  assert.deepEqual(cleared, [2]);
});

test('startDailyAutoRefresh supports interval mode for realtime leaderboard refresh', async () => {
  const timers = [];
  const cleared = [];
  let runCount = 0;

  const stop = startDailyAutoRefresh({
    enabled: true,
    runOnStartup: false,
    mode: 'interval',
    intervalMinutes: 5,
    nowProvider: () => new Date(2026, 4, 13, 1, 0, 0, 0),
    setTimeoutFn(fn, delay) {
      const timer = { id: timers.length + 1, fn, delay };
      timers.push(timer);
      return timer.id;
    },
    clearTimeoutFn(id) {
      cleared.push(id);
    },
    logger: { info() {}, error() {} },
    runRefresh: async () => {
      runCount += 1;
      return [{ type: 'drama', status: 'success', count: 1 }];
    },
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 300_000);

  await timers[0].fn();

  assert.equal(runCount, 1);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 300_000);

  stop();
  assert.deepEqual(cleared, [2]);
});

test('startDailyAutoRefresh increases interval after failed runs when backoff is enabled', async () => {
  const timers = [];

  const stop = startDailyAutoRefresh({
    enabled: true,
    runOnStartup: false,
    mode: 'interval',
    intervalMinutes: 5,
    failureBackoffEnabled: true,
    failureBackoffMultiplier: 2,
    failureBackoffMaxMinutes: 30,
    nowProvider: () => new Date(2026, 4, 13, 1, 0, 0, 0),
    setTimeoutFn(fn, delay) {
      const timer = { id: timers.length + 1, fn, delay };
      timers.push(timer);
      return timer.id;
    },
    clearTimeoutFn() {},
    logger: { info() {}, error() {} },
    runRefresh: async () => [{ type: 'drama', status: 'failed', count: 0 }],
  });

  assert.equal(timers[0].delay, 300_000);
  await timers[0].fn();
  assert.equal(timers[1].delay, 600_000);
  await timers[1].fn();
  assert.equal(timers[2].delay, 1_200_000);

  stop();
});
