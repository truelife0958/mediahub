import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exitWithChild, repoRoot, spawnNpm } from './npm-runner.mjs';

const command = process.argv[2];
const passthroughArgs = process.argv.slice(3);

/**
 * Parse the project-root `.env` file into a flat key-value object.
 * Skips blank lines and comments. Strips surrounding quotes from values.
 * Does NOT override variables already present in the environment (system
 * env takes precedence).
 */
function loadDotEnv(dir = repoRoot) {
  const envPath = resolve(dir, '.env');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return {};
  }

  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = value;
  }
  return result;
}

const dotEnv = loadDotEnv();

const backendRefreshEnv = {
  MEDIAHUB_DB_DISABLED: process.env.MEDIAHUB_DB_DISABLED ?? 'true',
  MEDIAHUB_JSON_DATASET_ENABLED: process.env.MEDIAHUB_JSON_DATASET_ENABLED ?? 'true',
  MEDIAHUB_AUTO_REFRESH_ENABLED: process.env.MEDIAHUB_AUTO_REFRESH_ENABLED ?? 'true',
  MEDIAHUB_AUTO_REFRESH_ON_STARTUP: process.env.MEDIAHUB_AUTO_REFRESH_ON_STARTUP ?? 'false',
  MEDIAHUB_AUTO_REFRESH_MODE: process.env.MEDIAHUB_AUTO_REFRESH_MODE ?? 'daily',
  MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES: process.env.MEDIAHUB_AUTO_REFRESH_INTERVAL_MINUTES ?? '5',
  MEDIAHUB_INGEST_BACKFILL_PAGES: '3',
  MEDIAHUB_INGEST_BACKFILL_PAGE_SIZE: '30',
  MEDIAHUB_INGEST_BACKFILL_SORTS: 'hot,latest',
  UPSTREAM_TIMEOUT_MS: '12000',
  UPSTREAM_RETRY_MAX_ATTEMPTS: '3',
  UPSTREAM_RETRY_BASE_DELAY_MS: '400',
  MEDIAHUB_PLATFORM_SOURCE_ENABLED: 'false',
};

function run(args, envOverrides = {}) {
  // .env values serve as defaults; system env overrides them; explicit
  // envOverrides (e.g. backendRefreshEnv) take the highest precedence.
  const child = spawnNpm(args, {
    cwd: repoRoot,
    env: { ...dotEnv, ...process.env, ...envOverrides },
    stdio: 'inherit',
  });
  exitWithChild(child);
}

switch (command) {
  case 'dev-backend':
    run(['run', 'dev', '--workspace=backend'], backendRefreshEnv);
    break;
  case 'dev-frontend':
    run(['run', 'dev', '--workspace=frontend', '--', ...passthroughArgs]);
    break;
  case 'start-backend':
    run(['run', 'start', '--workspace=backend'], backendRefreshEnv);
    break;
  default:
    console.error('Usage: node scripts/run-mediahub-command.mjs dev-backend|dev-frontend|start-backend');
    process.exit(1);
}
