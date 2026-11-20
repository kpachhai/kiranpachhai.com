// Runs every quality gate in order, each as its own process, and reads each exit code straight from
// that process. Only when all of them pass does it write { date, passed, total } to
// src/data/gates.json, which the footer renders; any failure exits 1 and leaves the file as it was.
// After a full pass it rebuilds dist/ once, so the build to deploy carries the line it just wrote,
// and checks the built footer against the file. If that rebuild or check fails, it puts the previous
// gates.json back (or removes the new one when there was none) and exits 1.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gatesLine, parseGates, type Gates } from '../../src/lib/gates'

export type Gate = { name: string; script: string }
export type GateResult = { name: string; status: number | null }

// npm test builds dist/ once (tests/unit/build-once.ts); every later gate reads that build.
export const GATES: Gate[] = [
  { name: 'tests', script: 'test' },
  { name: 'typecheck', script: 'typecheck' },
  { name: 'provenance', script: 'gate:provenance' },
  { name: 'copy-scan', script: 'gate:copy' },
  { name: 'budget', script: 'gate:budget' },
  { name: 'axe', script: 'gate:a11y' },
  { name: 'links', script: 'gate:links' },
  { name: 'lighthouse', script: 'gate:lighthouse' },
]

export const GATES_FILE = 'src/data/gates.json'

export function recordIfAllPassed(results: GateResult[], path: string, date: string): boolean {
  const ranEveryGate = GATES.every((gate) => results.some((result) => result.name === gate.name))
  if (!ranEveryGate || results.some((result) => result.status !== 0)) return false
  const passed = results.filter((result) => result.status === 0).length
  writeFileSync(path, `${JSON.stringify({ date, passed, total: GATES.length }, null, 2)}\n`)
  return true
}

// True when the page's footer reads the gates line for these results, with the same machine date.
export function footerShows(html: string, gates: Gates): boolean {
  const start = html.indexOf('<footer')
  const footer = start < 0 ? '' : html.slice(start, html.indexOf('</footer>', start))
  const text = footer.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
  return text.includes(gatesLine(gates)) && footer.includes(`datetime="${gates.date}"`)
}

const localDate = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// Lighthouse drives the Chromium that Playwright installs unless CHROME_PATH already names a browser.
async function gateEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.env.CHROME_PATH) return process.env
  const { chromium } = await import('@playwright/test')
  return { ...process.env, CHROME_PATH: chromium.executablePath() }
}

function runGate(gate: Gate, env: NodeJS.ProcessEnv): GateResult {
  console.log(`\n== gate ${gate.name}: npm run ${gate.script}`)
  const child = spawnSync('npm', ['run', gate.script], { stdio: 'inherit', env })
  if (child.error) console.error(`gate ${gate.name} could not start: ${child.error.message}`)
  return { name: gate.name, status: child.status }
}

// How a full pass is published: rebuild dist/ and read its home page. Injected so tests can fail either step.
export type Publisher = { rebuild: () => number | null; builtHome: () => string }

const npmPublisher: Publisher = {
  rebuild: () => {
    console.log('\n== rebuild: npm run build')
    return spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status
  },
  builtHome: () => readFileSync(join('dist', 'index.html'), 'utf8'),
}

// Why the rebuilt site does not carry the line in the gates file, or null when it does.
function publishProblem(path: string, publisher: Publisher): string | null {
  const status = publisher.rebuild()
  if (status !== 0) return `Rebuild exited ${status}; dist/ does not carry the new gates line.`
  const gates = parseGates(JSON.parse(readFileSync(path, 'utf8')))
  let html: string
  try {
    html = publisher.builtHome()
  } catch (error) {
    return `Could not read the built home page: ${(error as Error).message}`
  }
  return footerShows(html, gates) ? null : `The built footer does not read "${gatesLine(gates)}".`
}

// Writes the gates file for a full pass, then rebuilds and checks the footer. Any failure after the
// write restores the file as it was before this run, so no file claims a run that exited non-zero.
export function recordAndPublish(results: GateResult[], path: string, date: string, publisher: Publisher = npmPublisher): number {
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (!recordIfAllPassed(results, path, date)) {
    console.log(`Not every gate passed; ${path} is unchanged.`)
    return 1
  }
  console.log(`All ${GATES.length} gates passed; wrote ${path}.`)
  const problem = publishProblem(path, publisher)
  if (problem === null) {
    console.log(`Rebuilt; the footer reads "${gatesLine(parseGates(JSON.parse(readFileSync(path, 'utf8'))))}".`)
    return 0
  }
  if (previous === null) rmSync(path)
  else writeFileSync(path, previous)
  console.error(`${problem} ${previous === null ? `Removed the new ${path}` : `Restored the previous ${path}`}; rebuild dist/ before deploying.`)
  return 1
}

async function main(): Promise<number> {
  const env = await gateEnv()
  const results = GATES.map((gate) => runGate(gate, env))
  console.log('\n== summary')
  for (const result of results) console.log(`${result.name.padEnd(12)} exit ${result.status}`)
  return recordAndPublish(results, GATES_FILE, localDate(new Date()))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main())
}
