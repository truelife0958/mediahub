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
  assert.ok(tables.includes('ingestion_cursors'));
  assert.ok(tables.includes('contents_fts'));
  assert.equal(tables.includes('users'), false);
  assert.equal(tables.includes('watch_history'), false);
  assert.equal(tables.includes('favorites'), false);
  assert.equal(tables.includes('ai_runtime_config'), false);
  assert.equal(tables.includes('admin_reference_settings'), false);
});

test('initializeDatabase ensures FTS triggers and dedupe columns exist', () => {
  resetDatabaseForTest(':memory:');
  const db = getDatabase();

  const triggerNames = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name"
  ).all().map(row => row.name);
  const columns = db.prepare('PRAGMA table_info(contents)').all().map(row => row.name);

  assert.ok(triggerNames.includes('contents_insert_fts'));
  assert.ok(triggerNames.includes('contents_delete_fts'));
  assert.ok(triggerNames.includes('contents_update_fts'));
  assert.equal(triggerNames.includes('contents_ai_fts'), false);
  assert.equal(triggerNames.includes('contents_ad_fts'), false);
  assert.equal(triggerNames.includes('contents_au_fts'), false);
  assert.ok(columns.includes('normalized_title'));
  assert.ok(columns.includes('dedupe_hash'));
});
