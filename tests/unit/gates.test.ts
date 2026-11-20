import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gatesLine, parseGates } from '../../src/lib/gates'
import { GATES, footerShows, recordAndPublish, recordIfAllPassed } from '../../scripts/gates/run-all'
import { findViolations } from '../../scripts/gates/copy-scan'

const fixture = JSON.parse(readFileSync('tests/fixtures/gates/gates.json', 'utf8'))

describe('gates summary', () => {
  it('renders the footer line from a fixture gates.json', () => {
    expect(gatesLine(parseGates(fixture))).toBe('Passed 8 of 8 gates on 2026-11-18')
  })

  it('carries no hedge or employer words', () => {
    expect(findViolations(gatesLine(parseGates(fixture)))).toEqual([])
  })

  it('rejects a summary that is malformed or claims more passes than gates', () => {
    expect(() => parseGates({ ...fixture, passed: 9 })).toThrow()
    expect(() => parseGates({ ...fixture, date: '18 Nov 2026' })).toThrow()
    expect(() => parseGates({ ...fixture, extra: true })).toThrow()
  })
})

describe('run-all', () => {
  it('runs the eight gates in order', () => {
    expect(GATES.map((gate) => gate.name)).toEqual(['tests', 'typecheck', 'provenance', 'copy-scan', 'budget', 'axe', 'links', 'lighthouse'])
  })

  const passing = GATES.map((gate) => ({ name: gate.name, status: 0 }))

  it('writes { date, passed, total } when every gate passes', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gates-')), 'gates.json')
    expect(recordIfAllPassed(passing, path, '2026-11-20')).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ date: '2026-11-20', passed: 8, total: 8 })
  })

  it('leaves gates.json unchanged when any gate fails or cannot start', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gates-')), 'gates.json')
    writeFileSync(path, 'previous')
    expect(recordIfAllPassed([...passing.slice(1), { name: 'tests', status: 1 }], path, '2026-11-20')).toBe(false)
    expect(recordIfAllPassed([...passing.slice(1), { name: 'tests', status: null }], path, '2026-11-20')).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('previous')

    const absent = join(mkdtempSync(join(tmpdir(), 'gates-')), 'gates.json')
    expect(recordIfAllPassed(passing.slice(1), absent, '2026-11-20')).toBe(false)
    expect(existsSync(absent)).toBe(false)
  })
})

// After a full pass run-all rebuilds and checks the built footer against gates.json with footerShows.
describe('footer check after the rebuild', () => {
  const gates = parseGates(fixture)
  const html = (line: string) => `<html><body><main></main><footer class="site-footer"><span>Kiran Pachhai</span>${line}</footer></body></html>`

  it('accepts a footer that carries the recorded line and date', () => {
    expect(footerShows(html('<p class="gates">Passed 8 of 8 gates on <time datetime="2026-11-18">2026-11-18</time></p>'), gates)).toBe(true)
  })

  it('rejects a footer with the previous date, another count, or no line', () => {
    expect(footerShows(html('<p class="gates">Passed 8 of 8 gates on <time datetime="2026-11-17">2026-11-17</time></p>'), gates)).toBe(false)
    expect(footerShows(html('<p class="gates">Passed 7 of 8 gates on <time datetime="2026-11-18">2026-11-18</time></p>'), gates)).toBe(false)
    expect(footerShows(html(''), gates)).toBe(false)
  })
})

// recordAndPublish: write on a full pass, rebuild, check the footer; restore on any later failure.
describe('publishing a full pass', () => {
  const passing = GATES.map((gate) => ({ name: gate.name, status: 0 }))
  const footer = (date: string) => `<footer><p>Passed 8 of 8 gates on <time datetime="${date}">${date}</time></p></footer>`
  const tempFile = () => join(mkdtempSync(join(tmpdir(), 'gates-')), 'gates.json')
  const previous = '{\n  "date": "2026-11-01",\n  "passed": 8,\n  "total": 8\n}\n'

  it('keeps the new file when the rebuild passes and the footer reads it', () => {
    const path = tempFile()
    writeFileSync(path, previous)
    const status = recordAndPublish(passing, path, '2026-11-20', { rebuild: () => 0, builtHome: () => footer('2026-11-20') })
    expect(status).toBe(0)
    expect(JSON.parse(readFileSync(path, 'utf8')).date).toBe('2026-11-20')
  })

  it('restores the previous file when the rebuild fails', () => {
    const path = tempFile()
    writeFileSync(path, previous)
    const status = recordAndPublish(passing, path, '2026-11-20', { rebuild: () => 1, builtHome: () => footer('2026-11-20') })
    expect(status).toBe(1)
    expect(readFileSync(path, 'utf8')).toBe(previous)
  })

  it('restores the previous file when the rebuild cannot start', () => {
    const path = tempFile()
    writeFileSync(path, previous)
    expect(recordAndPublish(passing, path, '2026-11-20', { rebuild: () => null, builtHome: () => footer('2026-11-20') })).toBe(1)
    expect(readFileSync(path, 'utf8')).toBe(previous)
  })

  it('restores the previous file when the built footer does not carry the new line', () => {
    const path = tempFile()
    writeFileSync(path, previous)
    expect(recordAndPublish(passing, path, '2026-11-20', { rebuild: () => 0, builtHome: () => footer('2026-11-01') })).toBe(1)
    expect(readFileSync(path, 'utf8')).toBe(previous)
  })

  it('removes the new file when none existed and the rebuild or footer check fails', () => {
    const afterRebuild = tempFile()
    expect(recordAndPublish(passing, afterRebuild, '2026-11-20', { rebuild: () => 1, builtHome: () => footer('2026-11-20') })).toBe(1)
    expect(existsSync(afterRebuild)).toBe(false)
    const afterFooter = tempFile()
    expect(recordAndPublish(passing, afterFooter, '2026-11-20', { rebuild: () => 0, builtHome: () => '<footer></footer>' })).toBe(1)
    expect(existsSync(afterFooter)).toBe(false)
  })

  it('neither writes nor rebuilds when a gate failed', () => {
    const path = tempFile()
    writeFileSync(path, previous)
    let rebuilt = false
    const failed = [...passing.slice(1), { name: 'tests', status: 1 }]
    expect(recordAndPublish(failed, path, '2026-11-20', { rebuild: () => ((rebuilt = true), 0), builtHome: () => '' })).toBe(1)
    expect(rebuilt).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(previous)
  })
})

// dist/ is built once by tests/unit/build-once.ts; the footer reads src/data/gates.json when present.
describe('built footer', () => {
  it('shows the recorded gates line with the same date as gates.json, or none before the first full pass', () => {
    const recorded = 'src/data/gates.json'
    const html = readFileSync(join('dist', 'index.html'), 'utf8')
    if (existsSync(recorded)) {
      const gates = parseGates(JSON.parse(readFileSync(recorded, 'utf8')))
      expect(footerShows(html, gates)).toBe(true)
      const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
      expect(/<time datetime="([^"]+)"/.exec(footer)?.[1]).toBe(gates.date)
    } else {
      expect(html.slice(html.indexOf('<footer'))).not.toMatch(/gates on/)
    }
  })
})
