import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = resolve(__dirname, '../../../data');
const fileLocks = new Map();

function resolveDataDir(dataDir) {
  return resolve(dataDir || process.env.MEDIAHUB_JSON_DATA_DIR || DEFAULT_DATA_DIR);
}

function isJsonHotDataEnabled({ dataDir } = {}) {
  const flag = String(process.env.MEDIAHUB_JSON_DATASET_ENABLED || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(flag)) return false;
  if (dataDir || process.env.MEDIAHUB_JSON_DATA_DIR) return true;
  return process.env.NODE_TEST_CONTEXT !== 'child-v8';
}

function normalizeErrorCode(error) {
  return String(error?.code || '').toUpperCase();
}

function isJsonParseError(error) {
  return error instanceof SyntaxError || String(error?.message || '').toLowerCase().includes('json');
}

async function withFileLock(path, task) {
  const key = resolve(path);
  const previous = fileLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolveRelease => { release = resolveRelease; });
  const chained = previous.then(() => current, () => current);
  fileLocks.set(key, chained);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (fileLocks.get(key) === chained) fileLocks.delete(key);
  }
}

async function readJsonFile(path, fallback, { recoverCorrupt = false, label = path } = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (normalizeErrorCode(error) === 'ENOENT') return fallback;
    if (recoverCorrupt && isJsonParseError(error)) {
      return typeof fallback === 'function'
        ? fallback(error)
        : fallback;
    }
    error.message = `Failed to read JSON ${label}: ${error.message}`;
    throw error;
  }
}

async function writeJsonFileUnlocked(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${randomUUID()}.${String(path).split(/[\\/]/).pop()}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeJsonFile(path, value) {
  await withFileLock(path, () => writeJsonFileUnlocked(path, value));
}

function getTodayKey(now = new Date(), timeZone = 'Asia/Shanghai') {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-gregory', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const getPart = type => parts.find(part => part.type === type)?.value || '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

async function readSeedItems(type, { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  return readJsonFile(join(root, 'seeds', `${type}.json`), [], { recoverCorrupt: false, label: `seed ${type}` });
}

async function readCurrentDataset(type, { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  return readJsonFile(join(root, 'current', `${type}.json`), null, { recoverCorrupt: true, label: `current ${type}` });
}

async function writeCurrentDataset(type, dataset, { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  await writeJsonFile(join(root, 'current', `${type}.json`), dataset);
}

async function writeSnapshotDataset(type, dataset, { dataDir, now = new Date() } = {}) {
  const root = resolveDataDir(dataDir);
  await writeJsonFile(join(root, 'snapshots', getTodayKey(now), `${type}.json`), dataset);
}

async function readIndex(name, { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  return readJsonFile(join(root, 'indexes', `${name}-index.json`), {}, { recoverCorrupt: true, label: `index ${name}` });
}

async function writeIndexes(indexes, { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  await Promise.all(Object.entries(indexes).map(([name, value]) => (
    writeJsonFile(join(root, 'indexes', `${name}-index.json`), value)
  )));
}

async function appendCrawlLog(run, { dataDir, now = new Date() } = {}) {
  const root = resolveDataDir(dataDir);
  const date = getTodayKey(now);
  const logPath = join(root, 'logs', `crawl-${date}.json`);
  return withFileLock(logPath, async () => {
    const current = await readJsonFile(logPath, { date, updatedAt: '', runs: [] }, {
      recoverCorrupt: true,
      label: `crawl log ${date}`,
    });
    const baseRuns = Array.isArray(current?.runs) ? current.runs : [];
    const corruptRecovery = current && !Array.isArray(current.runs) ? { recoveredFromCorruptLog: true } : {};
    const runs = [...baseRuns];
    const entry = {
      id: `${date}-${String(runs.length + 1).padStart(4, '0')}-${randomUUID().slice(0, 8)}`,
      ...corruptRecovery,
      ...run,
    };
    const next = {
      date,
      updatedAt: new Date().toISOString(),
      runs: [...runs, entry],
    };
    await writeJsonFileUnlocked(logPath, next);
    return next;
  });
}

async function readCrawlLog(date = getTodayKey(new Date()), { dataDir } = {}) {
  const root = resolveDataDir(dataDir);
  return readJsonFile(join(root, 'logs', `crawl-${date}.json`), {
    date,
    updatedAt: '',
    runs: [],
  }, {
    recoverCorrupt: true,
    label: `crawl log ${date}`,
  });
}

function resetJsonStoreLocksForTest() {
  fileLocks.clear();
}

export {
  getTodayKey,
  readSeedItems,
  readCurrentDataset,
  writeCurrentDataset,
  writeSnapshotDataset,
  readIndex,
  writeIndexes,
  appendCrawlLog,
  readCrawlLog,
  resolveDataDir,
  isJsonHotDataEnabled,
  resetJsonStoreLocksForTest,
  withFileLock,
};
