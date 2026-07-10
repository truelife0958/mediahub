import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { CONTENT_TYPES } from './autoRefreshService.js';
import { refreshContentType } from './ingestionService.js';
import { getSystemSettingsSnapshot } from './systemSettingsService.js';
import { resolveDataDir, withFileLock } from '../store/jsonStore.js';

const RECENT_JOB_LIMIT = 10;
const queue = [];
let defaultRefreshType = refreshContentType;
let activeJob = null;
let processing = false;
let recentJobs = [];
let persistError = null;
let persistChain = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function buildBackfillOptions(settings = getSystemSettingsSnapshot()) {
  return {
    pageCount: settings.ingestBackfill.pages,
    pageSize: settings.ingestBackfill.pageSize,
    sortModes: settings.ingestBackfill.sorts,
  };
}

function normalizeTypes(types) {
  const input = Array.isArray(types) ? types : String(types || '').split(',');
  const normalized = input.map(type => String(type || '').trim()).filter(type => CONTENT_TYPES.includes(type));
  return normalized.length ? [...new Set(normalized)] : [...CONTENT_TYPES];
}

function createJob({ trigger = 'manual-queued', types, backfill, refreshType, logger = console } = {}) {
  const jobTypes = normalizeTypes(types);
  const enqueuedAt = nowIso();
  return {
    id: `refresh-${Date.now()}-${randomUUID().slice(0, 8)}`,
    trigger,
    types: jobTypes,
    status: 'queued',
    currentType: null,
    currentStage: 'queued',
    progress: {
      total: jobTypes.length,
      completed: 0,
      failed: 0,
    },
    results: [],
    error: null,
    enqueuedAt,
    startedAt: null,
    finishedAt: null,
    updatedAt: enqueuedAt,
    backfill: backfill || buildBackfillOptions(),
    refreshType: refreshType || defaultRefreshType,
    logger,
  };
}

function toJobSnapshot(job) {
  if (!job) return null;
  return {
    id: job.id,
    trigger: job.trigger,
    types: [...job.types],
    status: job.status,
    currentType: job.currentType,
    currentStage: job.currentStage,
    progress: { ...job.progress },
    results: job.results.map(result => ({ ...result })),
    error: job.error,
    enqueuedAt: job.enqueuedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
    backfill: { ...job.backfill, sortModes: [...(job.backfill?.sortModes || [])] },
  };
}

function getRefreshJobQueueStatus() {
  return {
    running: Boolean(activeJob),
    queueLength: queue.length,
    activeJob: toJobSnapshot(activeJob),
    queuedJobs: queue.map(toJobSnapshot),
    recentJobs: recentJobs.map(toJobSnapshot),
    persistError,
    updatedAt: nowIso(),
  };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${randomUUID()}.${basename(path)}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}
`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function persistQueueStatus() {
  const path = join(resolveDataDir(), 'logs', 'refresh-jobs.json');
  const snapshot = getRefreshJobQueueStatus();
  await withFileLock(path, () => writeJsonAtomic(path, snapshot));
  persistError = null;
}

function schedulePersist() {
  persistChain = persistChain
    .then(() => persistQueueStatus())
    .catch(error => {
      persistError = error?.message || 'persist refresh queue status failed';
      console.warn('[refresh-jobs] persist failed:', persistError);
    });
  return persistChain;
}

function flushRefreshJobQueuePersistence() {
  return persistChain;
}

function updateJob(job, patch = {}) {
  Object.assign(job, patch, { updatedAt: nowIso() });
  schedulePersist();
}

function createResult(type, response, startedAt) {
  return {
    type,
    status: 'success',
    count: Number(response?.count) || 0,
    durationMs: Date.now() - startedAt,
    warning: response?.warning || response?.leaderboardWarning || null,
    fallbackUsed: Boolean(response?.fallbackUsed || response?.jsonDataset?.fallbackUsed),
    jsonDataset: response?.jsonDataset || null,
    supplementalSignals: response?.supplementalSignals || { count: 0, errors: [] },
  };
}

function createFailedResult(type, error, startedAt) {
  return {
    type,
    status: 'failed',
    count: 0,
    error: error?.message || 'refresh failed',
    durationMs: Date.now() - startedAt,
  };
}

async function runJob(job) {
  updateJob(job, {
    status: 'running',
    currentStage: 'starting',
    startedAt: nowIso(),
  });

  for (const type of job.types) {
    const startedAt = Date.now();
    updateJob(job, {
      currentType: type,
      currentStage: 'fetching',
    });
    let result;
    try {
      const response = await job.refreshType(type, job.backfill);
      result = createResult(type, response, startedAt);
    } catch (error) {
      result = createFailedResult(type, error, startedAt);
      job.logger?.error?.(`[refresh-jobs] type=${type} failed: ${result.error}`);
    }
    job.results.push(result);
    job.progress.completed += 1;
    if (result.status === 'failed') job.progress.failed += 1;
    updateJob(job, {
      currentStage: result.status === 'success' ? 'stored' : 'failed',
    });
  }

  const failed = job.results.filter(result => result.status === 'failed').length;
  const warnings = job.results.filter(result => result.warning).length;
  const allFailed = failed > 0 && failed === job.results.length;
  updateJob(job, {
    status: allFailed ? 'failed' : (failed ? 'partial' : 'success'),
    currentType: null,
    currentStage: allFailed ? 'failed' : (failed ? 'completed_with_errors' : (warnings ? 'completed_with_warnings' : 'completed')),
    error: failed ? `${failed} module(s) failed` : null,
    finishedAt: nowIso(),
  });
}

function finishJob(job) {
  recentJobs = [job, ...recentJobs].slice(0, RECENT_JOB_LIMIT);
}

function drainQueue() {
  if (processing) return;
  processing = true;
  Promise.resolve()
    .then(async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        activeJob = job;
        schedulePersist();
        try {
          await runJob(job);
        } catch (error) {
          updateJob(job, {
            status: 'failed',
            currentStage: 'failed',
            error: error?.message || 'refresh job failed',
            finishedAt: nowIso(),
          });
        } finally {
          finishJob(job);
          activeJob = null;
          schedulePersist();
        }
      }
    })
    .finally(() => {
      processing = false;
      schedulePersist();
      if (queue.length > 0) drainQueue();
    });
}

function enqueueRefreshAllContentTypesJob(options = {}) {
  const job = createJob(options);
  queue.push(job);
  schedulePersist();
  drainQueue();
  return toJobSnapshot(job);
}

function setRefreshJobQueueRunnerForTest(refreshType = refreshContentType) {
  defaultRefreshType = refreshType;
}

function resetRefreshJobQueueForTest() {
  queue.length = 0;
  activeJob = null;
  processing = false;
  recentJobs = [];
  persistError = null;
  persistChain = Promise.resolve();
  defaultRefreshType = refreshContentType;
}

export {
  enqueueRefreshAllContentTypesJob,
  flushRefreshJobQueuePersistence,
  getRefreshJobQueueStatus,
  normalizeTypes,
  resetRefreshJobQueueForTest,
  setRefreshJobQueueRunnerForTest,
};
