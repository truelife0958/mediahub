import { createApp } from './app.js';
import { isDatabaseDisabled } from './db/database.js';
import { startAutoRefreshRuntime, stopAutoRefreshRuntime } from './services/autoRefreshRuntimeService.js';
import { seedAllCuratedRealContents } from './services/curatedRealContentService.js';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const app = createApp();
const seedResults = isDatabaseDisabled() ? [] : seedAllCuratedRealContents();
startAutoRefreshRuntime();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  const seededTotal = seedResults.reduce((sum, item) => sum + Number(item.count || 0), 0);
  console.log(`MediaHub curated data ready: ${seededTotal} rows written across ${seedResults.length} categories`);
  console.log(`MediaHub API running on http://${HOST}:${PORT}`);
});

function shutdown() {
  stopAutoRefreshRuntime();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
