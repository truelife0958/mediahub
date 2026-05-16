import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB_PATH = path.resolve(PROJECT_ROOT, 'backend/data/mediahub.sqlite');
const MIGRATION_ID = '2026-05-15-drop-platform-sources';

function parseDbPath(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (token.startsWith('--db=')) {
      const next = token.slice('--db='.length).trim();
      if (next) return path.resolve(next);
    }
    if (token === '--db') {
      const next = String(argv[i + 1] || '').trim();
      if (next) return path.resolve(next);
    }
  }

  const envPath = String(process.env.MEDIAHUB_DB_PATH || '').trim();
  if (envPath) return path.resolve(envPath);
  return DEFAULT_DB_PATH;
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

function hasApplied(db, migrationId) {
  const row = db
    .prepare('SELECT id, applied_at FROM schema_migrations WHERE id = ?')
    .get(migrationId);
  return row || null;
}

function hasTable(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row?.name);
}

function runDropPlatformSourcesMigration(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DROP INDEX IF EXISTS idx_platform_sources_type_enabled');
    db.exec('DROP INDEX IF EXISTS idx_platform_sources_platform');
    db.exec('DROP TABLE IF EXISTS platform_sources');
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
      .run(MIGRATION_ID, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function main() {
  const dbPath = parseDbPath(process.argv.slice(2));

  if (!existsSync(path.dirname(dbPath))) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  try {
    ensureMigrationTable(db);

    const applied = hasApplied(db, MIGRATION_ID);
    if (applied) {
      console.log(`[skip] migration already applied: ${MIGRATION_ID} at ${applied.applied_at}`);
      return;
    }

    const existedBefore = hasTable(db, 'platform_sources');
    runDropPlatformSourcesMigration(db);
    const existsAfter = hasTable(db, 'platform_sources');

    console.log(`[ok] migration applied: ${MIGRATION_ID}`);
    console.log(`[db] ${dbPath}`);
    console.log(`[table] platform_sources existed_before=${existedBefore} exists_after=${existsAfter}`);
  } finally {
    db.close();
  }
}

main();
