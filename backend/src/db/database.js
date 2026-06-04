import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/mediahub.sqlite');
let database;
let databasePath = process.env.MEDIAHUB_DB_PATH || DEFAULT_DB_PATH;
let initializing = false;

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

function hasColumn(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some(row => row.name === columnName);
}

function hasIndex(db, indexName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(indexName);
  return Boolean(row?.name);
}

function hasTable(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row?.name);
}

function hasTrigger(db, triggerName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(triggerName);
  return Boolean(row?.name);
}

function hasVirtualTable(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row?.name);
}

function ensureContentColumns(db) {
  if (!hasColumn(db, 'contents', 'normalized_title')) {
    db.exec('ALTER TABLE contents ADD COLUMN normalized_title TEXT');
  }
  if (!hasColumn(db, 'contents', 'dedupe_hash')) {
    db.exec('ALTER TABLE contents ADD COLUMN dedupe_hash TEXT');
  }
  if (!hasColumn(db, 'contents', 'heat_metric')) {
    db.exec("ALTER TABLE contents ADD COLUMN heat_metric TEXT NOT NULL DEFAULT 'playback'");
  }
}

function ensureContentIndexes(db) {
  if (!hasIndex(db, 'idx_contents_dedupe_hash')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_dedupe_hash ON contents(dedupe_hash)');
  }
  if (!hasIndex(db, 'idx_contents_type_sort_updated')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_type_sort_updated ON contents(type, hot_score DESC, updated_at DESC)');
  }
}

function ensureContentFts(db) {
  if (!hasVirtualTable(db, 'contents_fts')) {
    db.exec(`
      CREATE VIRTUAL TABLE contents_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        author,
        ip_name,
        tokenize='unicode61 remove_diacritics 0 tokenchars _'
      )
    `);
  }

  if (!hasTrigger(db, 'contents_ai_fts')) {
    db.exec(`
      CREATE TRIGGER contents_ai_fts AFTER INSERT ON contents BEGIN
        INSERT INTO contents_fts(rowid, id, title, summary, author, ip_name)
        VALUES (new.rowid, new.id, new.title, new.summary, new.author, new.ip_name);
      END
    `);
  }

  if (hasTrigger(db, 'contents_ad_fts')) {
    db.exec('DROP TRIGGER contents_ad_fts');
  }
  db.exec(`
    CREATE TRIGGER contents_ad_fts AFTER DELETE ON contents BEGIN
      DELETE FROM contents_fts WHERE rowid = old.rowid;
    END
  `);

  if (hasTrigger(db, 'contents_au_fts')) {
    db.exec('DROP TRIGGER contents_au_fts');
  }
  db.exec(`
    CREATE TRIGGER contents_au_fts AFTER UPDATE ON contents BEGIN
      DELETE FROM contents_fts WHERE rowid = old.rowid;
      INSERT INTO contents_fts(rowid, id, title, summary, author, ip_name)
      VALUES (new.rowid, new.id, new.title, new.summary, new.author, new.ip_name);
    END
  `);

  // 增量迁移场景下，保证 FTS 与主表一致。
  db.exec('DELETE FROM contents_fts');
  db.exec(`
    INSERT INTO contents_fts(rowid, id, title, summary, author, ip_name)
    SELECT rowid, id, title, summary, author, ip_name
    FROM contents
  `);
}

function ensureIngestionCursors(db) {
  if (hasTable(db, 'ingestion_cursors')) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ingestion_cursors (
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      cursor TEXT,
      updated_at TEXT,
      last_status TEXT NOT NULL,
      last_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      refreshed_at TEXT NOT NULL,
      PRIMARY KEY (type, source)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ingestion_cursors_type_refreshed ON ingestion_cursors(type, refreshed_at DESC)');
}

function ensureAdminReferenceSettings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_reference_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      prompt_templates_json TEXT NOT NULL,
      keyword_presets_json TEXT NOT NULL,
      recommendation_rules_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function ensureLeaderboardInsightsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      capture_id TEXT NOT NULL,
      type TEXT NOT NULL,
      layer TEXT NOT NULL,
      rank INTEGER NOT NULL,
      content_id TEXT NOT NULL,
      title TEXT NOT NULL,
      hot_score INTEGER NOT NULL DEFAULT 0,
      heat_metric TEXT NOT NULL DEFAULT 'playback',
      status TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      captured_at TEXT NOT NULL,
      PRIMARY KEY (capture_id, rank)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_type_layer_captured ON leaderboard_snapshots(type, layer, captured_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_content_id ON leaderboard_snapshots(content_id, captured_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      layer TEXT NOT NULL,
      event_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prev_rank INTEGER,
      new_rank INTEGER,
      rank_delta INTEGER,
      prev_hot_score INTEGER,
      new_hot_score INTEGER,
      message TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      captured_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_events_type_layer_captured ON leaderboard_events(type, layer, captured_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_events_event_type ON leaderboard_events(event_type, captured_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      type TEXT,
      channel TEXT NOT NULL DEFAULT 'internal',
      target TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_keyword_subscriptions_keyword ON keyword_subscriptions(keyword)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_keyword_subscriptions_enabled ON keyword_subscriptions(enabled)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_subscription_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      capture_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      title TEXT NOT NULL,
      matched_field TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      captured_at TEXT NOT NULL,
      FOREIGN KEY (subscription_id) REFERENCES keyword_subscriptions(id) ON DELETE CASCADE
    )
  `);
  if (!hasColumn(db, 'keyword_subscription_hits', 'capture_id')) {
    db.exec("ALTER TABLE keyword_subscription_hits ADD COLUMN capture_id TEXT NOT NULL DEFAULT ''");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_keyword_subscription_hits_subscription ON keyword_subscription_hits(subscription_id, captured_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_keyword_subscription_hits_type ON keyword_subscription_hits(type, captured_at DESC)');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_subscription_hits_dedupe
    ON keyword_subscription_hits(subscription_id, type, content_id, matched_field, capture_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'admin',
      before_json TEXT NOT NULL DEFAULT '{}',
      patch_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_content_revisions_content_id ON content_revisions(content_id, created_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      actor TEXT NOT NULL DEFAULT 'admin',
      request_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity_type, created_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_alias_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_keyword TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      type TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_search_alias_groups_type_enabled ON search_alias_groups(type, enabled, updated_at DESC)');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_search_alias_groups_canonical_type ON search_alias_groups(canonical_keyword, COALESCE(type, ''))");
}

function initializeSchema(db) {
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

    CREATE TABLE IF NOT EXISTS ai_runtime_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER,
      model TEXT,
      base_url TEXT,
      api_key TEXT,
      updated_at TEXT NOT NULL
    );
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

  ensureContentColumns(db);
  ensureContentIndexes(db);
  ensureContentFts(db);
  ensureIngestionCursors(db);
  ensureAdminReferenceSettings(db);
  ensureLeaderboardInsightsSchema(db);
}

function getDatabase() {
  if (!database) {
    database = openDatabase();
    initializeSchema(database);
  }
  return database;
}

function initializeDatabase() {
  const db = getDatabase();
  if (initializing) return;
  initializing = true;
  try {
    initializeSchema(db);
  } finally {
    initializing = false;
  }
}

function resetDatabaseForTest(filePath = ':memory:') {
  if (database) database.close();
  databasePath = filePath;
  database = openDatabase(filePath);
  initializing = false;
  initializeDatabase();
}

export { getDatabase, initializeDatabase, resetDatabaseForTest };
