import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-e2e-'));
fs.mkdirSync(path.join(dataDir, 'db'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'file'), { recursive: true });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5900',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/dist/server/src/index.js',
    url: 'http://127.0.0.1:5900/api/health',
    env: {
      DATA_DIR: dataDir,
      PORT: '5900',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      E2E_RESET_ENABLED: '1',
    },
    timeout: 30000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
