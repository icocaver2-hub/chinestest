import { defineConfig, devices } from '@playwright/test';

/** E2Eはサブパス配信（GitHub Pagesのプロジェクトサイト相当）で本番ビルドを検証する。 */
export const E2E_BASE_PATH = '/chinestest-e2e/';
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${E2E_BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    env: { BASE_PATH: E2E_BASE_PATH },
    url: `http://localhost:${PORT}${E2E_BASE_PATH}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
