import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/mediahub.sqlite');
let database;
let databasePath = process.env.MEDIAHUB_DB_PATH || DEFAULT_DB_PATH;

function openDatabase(filePath = databasePath) {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  if (filePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
}

function getDatabase() {
  if (!database) database = openDatabase();
  return database;
}

function initializeDatabase() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      cover TEXT NOT NULL,
      summary TEXT NOT NULL,
      author TEXT,
      ip_name TEXT,
      status TEXT,
      hot_score INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL,
      actors_json TEXT NOT NULL,
      source_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contents_type_hot ON contents(type, hot_score DESC);
    CREATE INDEX IF NOT EXISTS idx_contents_type_updated ON contents(type, updated_at DESC);

    CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_source_runs_type_finished ON source_runs(type, finished_at DESC);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function resetDatabaseForTest(filePath = ':memory:') {
  if (database) database.close();
  databasePath = filePath;
  database = openDatabase(filePath);
  initializeDatabase();
}

export { getDatabase, initializeDatabase, resetDatabaseForTest };
