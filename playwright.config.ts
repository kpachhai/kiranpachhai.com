import { defineConfig, devices } from '@playwright/test'
import { e2ePort } from './tests/e2e/port'

// Builds, then serves dist/, so a run never tests a stale build. --ignore-lock keeps the
// server in the foreground, owned by Playwright, instead of joining a background preview.
// Port 4329 by default because Astro's 4321 collides with other local projects; set E2E_PORT to override.
const port = e2ePort(process.env.E2E_PORT)

// Firefox and WebKit run a smoke subset at 390 and 1280; Chromium runs everything.
const SMOKE = /@smoke/

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: `npx astro build && npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: SMOKE },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: SMOKE },
  ],
})
