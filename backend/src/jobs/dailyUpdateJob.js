import {
  CONTENT_TYPES,
  refreshAllTypes,
  startDailyAutoRefresh,
} from '../services/autoRefreshService.js';

async function runDailyUpdateJob({
  types = CONTENT_TYPES,
  refreshType,
  logger = console,
  backfill = {},
} = {}) {
  return refreshAllTypes({
    types,
    refreshType,
    logger,
    backfill,
  });
}

function startDailyUpdateJob({
  hour,
  minute,
  runOnStartup,
  logger = console,
  runRefresh,
  ...rest
} = {}) {
  return startDailyAutoRefresh({
    ...rest,
    mode: 'daily',
    hour,
    minute,
    runOnStartup,
    logger,
    runRefresh,
  });
}

export {
  CONTENT_TYPES,
  runDailyUpdateJob,
  startDailyUpdateJob,
};
