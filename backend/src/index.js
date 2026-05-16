import { createApp } from './app.js';
import { startDailyAutoRefresh } from './services/autoRefreshService.js';

const app = createApp();
const stopAutoRefresh = startDailyAutoRefresh();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`MediaHub API running on http://${HOST}:${PORT}`);
});

function shutdown() {
  stopAutoRefresh();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
