import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ENV_PATH = path.resolve(process.cwd(), '..', '.env');

const ALLOWED_ENV_KEYS = new Set([
  'MEDIAHUB_AI_ENABLED', 'MEDIAHUB_AI_MODEL', 'MEDIAHUB_AI_BASE_URL', 'MEDIAHUB_AI_API_KEY',
  'MEDIAHUB_AUTO_REFRESH_ENABLED', 'MEDIAHUB_AUTO_REFRESH_MODE', 'MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES',
  'MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_ENABLED', 'MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MULTIPLIER',
  'MEDIAHUB_AUTO_REFRESH_FAILURE_BACKOFF_MAX_MINUTES', 'MEDIAHUB_AUTO_REFRESH_HOUR', 'MEDIAHUB_AUTO_REFRESH_MINUTE',
  'MEDIAHUB_AUTO_REFRESH_ON_STARTUP', 'MEDIAHUB_INGEST_BACKFILL_PAGES', 'MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE',
  'MEDIAHUB_INGEST_BACKFILL_SORTS', 'CACHE_TTL_MS', 'UPSTREAM_TIMEOUT_MS', 'UPSTREAM_RETRY_MAX_ATTEMPTS',
  'UPSTREAM_RETRY_BASE_DELAY_MS', 'UPSTREAM_CIRCUIT_BREAKER_FAILURE_THRESHOLD', 'UPSTREAM_CIRCUIT_BREAKER_OPEN_MS',
  'UPSTREAM_RATE_LIMIT_PER_SECOND', 'UPSTREAM_RATE_LIMIT_BURST',
  'MEDIAHUB_WEBHOOK_NOTIFICATIONS_ENABLED', 'MEDIAHUB_WEBHOOK_NOTIFICATIONS_TIMEOUT_MS',
  'MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_MAX_ATTEMPTS', 'MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_BASE_DELAY_MS',
]);

function envFilePath() {
  return process.env.MEDIAHUB_ENV_FILE_PATH || DEFAULT_ENV_PATH;
}

function parseEnvFile(filePath = envFilePath()) {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, '\n');
  }
  return values;
}

function quoteEnv(value) {
  return JSON.stringify(String(value ?? ''));
}

function writeEnvValues(updates, filePath = envFilePath()) {
  const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([k]) => ALLOWED_ENV_KEYS.has(k)));
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const seen = new Set();
  const lines = existing.split(/\r?\n/).filter((line, index, arr) => index < arr.length - 1 || line !== '');
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !(match[1] in safeUpdates)) return line;
    const key = match[1];
    seen.add(key);
    return `${key}=${quoteEnv(safeUpdates[key])}`;
  });
  for (const [key, value] of Object.entries(safeUpdates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${quoteEnv(value)}`);
  }
  writeFileSync(filePath, `${nextLines.join('\n')}\n`);
  for (const [key, value] of Object.entries(safeUpdates)) {
    process.env[key] = String(value ?? '');
  }
}

export { envFilePath, parseEnvFile, writeEnvValues };
