// @ts-check
const { defineConfig } = require('playwright/test');
const { mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5179);
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 3003);
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const TEST_DB_DIR = path.join(os.tmpdir(), `mediahub-playwright-${BACKEND_PORT}-${FRONTEND_PORT}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'mediahub.sqlite');
const TEST_ENV_PATH = path.join(TEST_DB_DIR, 'mediahub.env');

mkdirSync(TEST_DB_DIR, { recursive: true });
process.env.MEDIAHUB_DB_PATH = process.env.MEDIAHUB_DB_PATH || TEST_DB_PATH;
process.env.MEDIAHUB_ENV_FILE_PATH = process.env.MEDIAHUB_ENV_FILE_PATH || TEST_ENV_PATH;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: `cd "/root/MediaHub" && PORT=${BACKEND_PORT} MEDIAHUB_DB_PATH="${process.env.MEDIAHUB_DB_PATH}" MEDIAHUB_ENV_FILE_PATH="${process.env.MEDIAHUB_ENV_FILE_PATH}" MEDIAHUB_AUTO_REFRESH_ENABLED=false MEDIAHUB_AUTO_REFRESH_ON_STARTUP=false MEDIAHUB_PLATFORM_SOURCE_ENABLED=false npm run dev --workspace=backend`,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `cd "/root/MediaHub" && VITE_API_TARGET=http://127.0.0.1:${BACKEND_PORT} npm run dev --workspace=frontend -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
