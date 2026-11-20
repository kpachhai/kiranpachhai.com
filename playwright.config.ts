import { defineConfig } from '@playwright/test'

// Serves the already built dist/; run `npm run build` first. --ignore-lock keeps the
// server in the foreground, owned by Playwright, instead of joining a background preview.
// Port 4329 by default because Astro's 4321 collides with other local projects; set E2E_PORT to override.
const port = Number(process.env.E2E_PORT ?? 4329)

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: { baseURL: `http://localhost:${port}` },
})
