import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { getIngestionCursor, saveIngestionCursor, listIngestionCursors } from '../src/utils/ingestionCursor.js';

test('ingestion cursor repository upserts and lists cursor snapshots', () => {
  resetDatabaseForTest(':memory:');

  const first = saveIngestionCursor({
    type: 'drama',
    source: 'platform_hot',
    cursor: 'drama:hongguo:100',
    updatedAt: '2026-05-13T00:00:00.000Z',
    lastStatus: 'success',
    lastCount: 10,
    lastError: null,
  });

  assert.equal(first.type, 'drama');
  assert.equal(first.source, 'platform_hot');
  assert.equal(first.cursor, 'drama:hongguo:100');

  const second = saveIngestionCursor({
    type: 'drama',
    source: 'platform_hot',
    cursor: 'drama:hongguo:101',
    updatedAt: '2026-05-14T00:00:00.000Z',
    lastStatus: 'failed',
    lastCount: 0,
    lastError: 'timeout',
  });

  assert.equal(second.cursor, 'drama:hongguo:101');
  assert.equal(second.lastStatus, 'failed');
  assert.equal(second.lastError, 'timeout');

  const byKey = getIngestionCursor({ type: 'drama', source: 'platform_hot' });
  assert.equal(byKey.cursor, 'drama:hongguo:101');

  const all = listIngestionCursors();
  assert.equal(all.length, 1);
  assert.equal(all[0].source, 'platform_hot');
});
