import { execSync } from 'node:child_process'

// Vitest globalSetup: one `astro build` into dist/ before any test file runs. Two test
// files building at once raced over Vite's cache directory (ENOTEMPTY), so the build
// tests read this single output instead of building their own.
export default function setup(): void {
  execSync('npm run build', { stdio: 'pipe' })
}
