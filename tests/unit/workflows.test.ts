import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { uses?: string; run?: string; shell?: string; with?: Record<string, unknown> }
type Job = { if?: string; needs?: string | string[]; permissions?: Record<string, string>; 'runs-on'?: string; steps: Step[] }
type Workflow = { on: Record<string, unknown>; permissions?: Record<string, string>; jobs: Record<string, Job> }

const DIR = '.github/workflows'
const read = (name: string) => readFileSync(join(DIR, name), 'utf8')
const load = (name: string) => parse(read(name)) as Workflow
const allFiles = () => readdirSync(DIR).filter((name) => /\.ya?ml$/.test(name))
const jobPermissions = (workflow: Workflow) => [workflow.permissions, ...Object.values(workflow.jobs).map((job) => job.permissions)]
const asList = (needs: Job['needs']) => (needs === undefined ? [] : [needs].flat())

describe('workflows', () => {
  const ci = load('ci.yml')
  const deploy = load('deploy.yml')

  it('every uses: is pinned to a 40-character commit SHA', () => {
    for (const name of allFiles()) {
      const uses = [...read(name).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((found) => found[1])
      expect(uses.length).toBeGreaterThan(0)
      for (const reference of uses) expect(reference, `${name}: ${reference}`).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/)
    }
  })

  it('every pinned action names its tag in a trailing comment', () => {
    for (const name of allFiles()) {
      for (const line of read(name).split('\n').filter((text) => /\buses:/.test(text))) expect(line, `${name}: ${line}`).toMatch(/@[0-9a-f]{40}\s+#\s*v\d/)
    }
  })

  it('deploy runs on workflow_dispatch only', () => {
    expect(Object.keys(deploy.on)).toEqual(['workflow_dispatch'])
  })

  it('publish needs verify', () => {
    expect(asList(deploy.jobs.publish.needs)).toContain('verify')
  })

  it('only the publish job has contents: write, and only in deploy.yml', () => {
    expect(deploy.permissions).toEqual({ contents: 'read' })
    expect(deploy.jobs.publish.permissions).toEqual({ contents: 'write' })
    const others = Object.entries(deploy.jobs).filter(([name]) => name !== 'publish')
    expect(others.length).toBeGreaterThan(0)
    for (const [, job] of others) expect(job.permissions ?? {}).not.toHaveProperty('contents', 'write')
  })

  it('ci has no write permission and never references gh-pages', () => {
    for (const permissions of jobPermissions(ci)) {
      for (const level of Object.values(permissions ?? {})) expect(level).not.toBe('write')
    }
    expect(ci.permissions).toEqual({ contents: 'read' })
    expect(read('ci.yml')).not.toMatch(/gh-pages/)
  })

  it('ci runs on pull_request and on push to main, and never on a schedule', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push'])
    expect((ci.on.push as { branches: string[] }).branches).toEqual(['main'])
  })

  it('ci cancels superseded runs per ref', () => {
    const concurrency = (ci as unknown as { concurrency: { group: string; 'cancel-in-progress': boolean } }).concurrency
    expect(concurrency.group).toMatch(/github\.ref/)
    expect(concurrency['cancel-in-progress']).toBe(true)
  })

  it('ci has a verify job on Linux and a windows-smoke job on Windows', () => {
    expect(ci.jobs.verify['runs-on']).toBe('ubuntu-latest')
    expect(ci.jobs['windows-smoke']['runs-on']).toBe('windows-latest')
    expect(JSON.stringify(ci.jobs['windows-smoke'].steps)).toMatch(/@windows/)
  })

  it('windows-smoke runs the @windows grep in bash, since PowerShell reads @windows as a variable', () => {
    const grepStep = ci.jobs['windows-smoke'].steps.find((step) => (step.run ?? '').includes('@windows'))
    expect(grepStep?.shell).toBe('bash')
  })

  it('lighthouse launches Chrome without the sandbox, which Ubuntu 24 runners cannot start', () => {
    const config = JSON.parse(readFileSync('lighthouserc.json', 'utf8')) as { ci: { collect: { settings: { chromeFlags?: string } } } }
    expect(config.ci.collect.settings.chromeFlags ?? '').toMatch(/--no-sandbox/)
  })

  it('lighthouse takes the median of 5 runs, since 3 let one slow shared-runner run fail the gate', () => {
    const config = JSON.parse(readFileSync('lighthouserc.json', 'utf8')) as { ci: { collect: { numberOfRuns: number } } }
    expect(config.ci.collect.numberOfRuns).toBe(5)
  })

  it('verify runs data, build, gates and e2e in that order, with Node from .nvmrc', () => {
    for (const workflow of [ci, deploy]) {
      const steps = workflow.jobs.verify.steps
      const runs = steps.map((step) => step.run ?? '')
      const order = ['npm ci', 'npm run data', 'npm run build', 'npm run gates', 'npm run test:e2e'].map((command) => runs.findIndex((run) => run.includes(command)))
      expect(order.every((index) => index >= 0)).toBe(true)
      expect([...order].sort((first, second) => first - second)).toEqual(order)
      expect(steps.find((step) => step.uses?.startsWith('actions/setup-node'))?.with?.['node-version-file']).toBe('.nvmrc')
    }
  })

  it('deploy asserts CNAME is kiranpachhai.com and publishes dist to gh-pages', () => {
    const text = read('deploy.yml')
    expect(text).toMatch(/dist\/CNAME/)
    expect(text).toMatch(/kiranpachhai\.com/)
    expect(text).toMatch(/gh-pages/)
    expect(text).toMatch(/Deploy \$\{GITHUB_SHA::7\}|Deploy \$\{\{ *github\.sha/)
  })

  it('deploy tags pre-redesign-2026 at the gh-pages head before publishing, only when absent', () => {
    const run = deploy.jobs.publish.steps.map((step) => step.run ?? '').join('\n')
    expect(run).toMatch(/pre-redesign-2026/)
    expect(run.indexOf('pre-redesign-2026')).toBeLessThan(run.lastIndexOf('push origin HEAD:gh-pages'))
    expect(run).toMatch(/ls-remote/)
  })

  it('verify and publish run only for a dispatch from main', () => {
    expect(deploy.jobs.verify.if).toBe("github.ref == 'refs/heads/main'")
    expect(deploy.jobs.publish.if).toBe("github.ref == 'refs/heads/main'")
  })

  it('the dist artifact keeps hidden files', () => {
    const upload = deploy.jobs.verify.steps.find((step) => step.uses?.startsWith('actions/upload-artifact'))
    expect(upload?.with?.['include-hidden-files']).toBe(true)
  })

  it('publish has no sparse-checkout: the gh-pages worktree would inherit it and skip new files', () => {
    expect(read('deploy.yml')).not.toMatch(/sparse-checkout/)
  })

  it('publish fails the run when a built _astro asset is missing from the gh-pages index', () => {
    const run = deploy.jobs.publish.steps.map((step) => step.run ?? '').join('\n')
    expect(run).toMatch(/git ls-files _astro/)
    expect(run).toMatch(/find _astro/)
    expect(run.indexOf('git ls-files _astro')).toBeGreaterThan(run.indexOf('git add --all'))
    expect(run.indexOf('git ls-files _astro')).toBeLessThan(run.indexOf('git commit'))
    expect(run).toMatch(/exit 1/)
  })

  it('the README says to rerun the whole workflow', () => {
    expect(readFileSync('README.md', 'utf8')).toMatch(/rerun the whole workflow/)
  })

  it('the README gives the rollback, the data refresh and where content lives', () => {
    const readme = readFileSync('README.md', 'utf8')
    // The tag the publish job makes is the one the rollback pushes back.
    const tag = deploy.jobs.publish.steps.map((step) => step.run ?? '').join('\n').match(/git tag (\S+) origin\/gh-pages/)?.[1]
    expect(tag).toBe('pre-redesign-2026')
    expect(readme).toContain(`git push --force origin refs/tags/${tag}:refs/heads/gh-pages`)
    expect(readme).toMatch(/git push --force origin <commit>:refs\/heads\/gh-pages/)
    expect(readme).toMatch(/copy `src\/data\/github\.json` over `src\/data\/github\.snapshot\.json`/)
    expect(readme).toContain('`src/model/data/`')
    expect(readme).toMatch(/`src\/data\/gates\.json`[^.]*commit it/)
  })

  it('uses no secret other than the default GITHUB_TOKEN', () => {
    for (const name of allFiles()) {
      for (const found of read(name).matchAll(/secrets\.(\w+)/g)) expect(found[1]).toBe('GITHUB_TOKEN')
    }
  })

  it('contains no em dash', () => {
    for (const name of allFiles()) expect(read(name)).not.toContain(String.fromCharCode(0x2014))
  })

  it('dependabot watches npm and github-actions weekly', () => {
    const config = parse(readFileSync('.github/dependabot.yml', 'utf8')) as { updates: { 'package-ecosystem': string; schedule: { interval: string } }[] }
    expect(config.updates.map((update) => update['package-ecosystem']).sort()).toEqual(['github-actions', 'npm'])
    for (const update of config.updates) expect(update.schedule.interval).toBe('weekly')
  })

  it('dependabot keeps @types/node on the major of the supported Node line', () => {
    type Update = { 'package-ecosystem': string; ignore?: { 'dependency-name': string; 'update-types'?: string[] }[] }
    const config = parse(readFileSync('.github/dependabot.yml', 'utf8')) as { updates: Update[] }
    const npm = config.updates.find((update) => update['package-ecosystem'] === 'npm')!
    const rule = npm.ignore?.find((entry) => entry['dependency-name'] === '@types/node')
    expect(rule?.['update-types']).toEqual(['version-update:semver-major'])
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { node: string }; devDependencies: Record<string, string> }
    expect(pkg.devDependencies['@types/node'].split('.')[0]).toBe(pkg.engines.node.replace(/^>=/, '').split('.')[0])
  })
})
