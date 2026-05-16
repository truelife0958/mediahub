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
  assert.ok(tables.includes('ingestion_cursors'));
  assert.ok(tables.includes('contents_fts'));
});

test('initializeDatabase ensures FTS triggers and dedupe columns exist', () => {
  resetDatabaseForTest(':memory:');
  const db = getDatabase();

  const triggerNames = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name"
  ).all().map(row => row.name);
  const columns = db.prepare('PRAGMA table_info(contents)').all().map(row => row.name);

  assert.ok(triggerNames.includes('contents_ai_fts'));
  assert.ok(triggerNames.includes('contents_ad_fts'));
  assert.ok(triggerNames.includes('contents_au_fts'));
  assert.ok(columns.includes('normalized_title'));
  assert.ok(columns.includes('dedupe_hash'));
});
