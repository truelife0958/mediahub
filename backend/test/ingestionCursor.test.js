import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { getIngestionCursor, saveIngestionCursor, listIngestionCursors } from '../src/utils/ingestionCursor.js';

test('ingestion cursor repository upserts and lists cursor snapshots', () => {
  resetDatabaseForTest(':memory:');

  const first = saveIngestionCursor({
    type: 'anime',
    source: 'ai_search',
    cursor: 'anime:ai-search:100',
    updatedAt: '2026-05-13T00:00:00.000Z',
    lastStatus: 'success',
    lastCount: 10,
    lastError: null,
  });

  assert.equal(first.type, 'anime');
  assert.equal(first.source, 'ai_search');
  assert.equal(first.cursor, 'anime:ai-search:100');

  const second = saveIngestionCursor({
    type: 'anime',
    source: 'ai_search',
    cursor: 'anime:ai-search:101',
    updatedAt: '2026-05-14T00:00:00.000Z',
    lastStatus: 'failed',
    lastCount: 0,
    lastError: 'timeout',
  });

  assert.equal(second.cursor, 'anime:ai-search:101');
  assert.equal(second.lastStatus, 'failed');
  assert.equal(second.lastError, 'timeout');

  const byKey = getIngestionCursor({ type: 'anime', source: 'ai_search' });
  assert.equal(byKey.cursor, 'anime:ai-search:101');

  const all = listIngestionCursors();
  assert.equal(all.length, 1);
  assert.equal(all[0].source, 'ai_search');
});
