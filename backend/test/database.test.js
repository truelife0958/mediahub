import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, initializeDatabase, resetDatabaseForTest } from '../src/db/database.js';

test('initializeDatabase creates content and source tables', () => {
  resetDatabaseForTest(':memory:');
  const db = getDatabase();
  initializeDatabase();

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name);

  assert.ok(tables.includes('contents'));
  assert.ok(tables.includes('source_runs'));
  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('watch_history'));
  assert.ok(tables.includes('favorites'));
});
