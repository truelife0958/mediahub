import { createApp } from './app.js';

const app = createApp();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`MediaHub API running on http://${HOST}:${PORT}`);
});
