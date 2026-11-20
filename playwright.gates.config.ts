import { defineConfig, devices } from '@playwright/test'
import { e2ePort } from './tests/e2e/port'

// The axe gate inside `npm run gates`: npm test has already built dist/, so this config serves that
// build as it is instead of building it again. Run `npm run test:e2e` for the build-first suite.
const port = e2ePort(process.env.E2E_PORT)

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'a11y.spec.ts',
  webServer: {
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
