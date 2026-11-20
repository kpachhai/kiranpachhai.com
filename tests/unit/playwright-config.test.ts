import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../playwright.config'
import gatesConfig from '../../playwright.gates.config'

describe('playwright config', () => {
  it('builds before serving, so e2e never runs against a stale dist', () => {
    const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer
    expect(server?.command).toMatch(/^npx astro build && npx astro preview /)
  })

  it('runs chromium in full and a smoke subset on firefox and webkit', () => {
    const projects = Object.fromEntries((config.projects ?? []).map((project) => [project.name, project]))
    expect(Object.keys(projects).sort()).toEqual(['chromium', 'firefox', 'webkit'])
    expect(projects.chromium.grep).toBeUndefined()
    expect(String(projects.firefox.grep)).toBe('/@smoke/')
    expect(String(projects.webkit.grep)).toBe('/@smoke/')
  })
})

describe('npm scripts', () => {
  // npm test builds once in its globalSetup (tests/unit/build-once.ts), so the gates after it must not build again.
  it('build once for the gates', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>
    expect(scripts.gates).toBe('node --import ./scripts/gates/ts-resolve.mjs scripts/gates/run-all.ts')
    const gateScripts = Object.entries(scripts).filter(([name]) => name.startsWith('gate:'))
    for (const [name, command] of gateScripts) expect(command, name).not.toMatch(/astro build|npm run build/)
  })

  it('serves the existing dist for the axe gate instead of building it again', () => {
    const server = Array.isArray(gatesConfig.webServer) ? gatesConfig.webServer[0] : gatesConfig.webServer
    expect(server?.command).toMatch(/^npx astro preview /)
    expect((gatesConfig.projects ?? []).map((project) => project.name)).toEqual(['chromium'])
  })
})
