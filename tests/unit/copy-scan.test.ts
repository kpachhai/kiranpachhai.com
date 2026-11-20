import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { EMPLOYER_DIGESTS, HEDGES } from '../../scripts/gates/copy-rules'
import { findViolations, scanHtml } from '../../scripts/gates/copy-scan'

const digest = (term: string) => createHash('sha256').update(term).digest('hex')
const employerDigests = [digest('acme'), digest('acme corp')]
const options = { employerDigests }
const fixture = (name: string) => readFileSync(join('tests/fixtures/copy', name), 'utf8')

describe('copy scan', () => {
  it('passes clean copy', () => {
    expect(scanHtml(fixture('clean.html'), options)).toEqual([])
  })

  it('flags an employer in visible text, reporting the original text', () => {
    const violations = scanHtml(fixture('employer-in-text.html'), options)
    expect(violations).toContainEqual({ rule: 'employer', match: 'Acme Corp' })
  })

  it('flags multi-word and single-word terms independently', () => {
    expect(findViolations('Acme', options)).toEqual([{ rule: 'employer', match: 'Acme' }])
    expect(findViolations('the  ACME\n corp team', options).map((v) => v.match)).toContain('ACME\n corp')
  })

  it('ignores an employer inside an href, src or data attribute', () => {
    expect(scanHtml(fixture('employer-in-href.html'), options)).toEqual([])
  })

  it('flags hedge words', () => {
    expect(scanHtml(fixture('hedge.html'), options)).toContainEqual({ rule: 'hedge', match: 'unconfirmed' })
    for (const hedge of HEDGES) {
      expect(findViolations(`so ${hedge.toUpperCase()} here`, options).some((v) => v.rule === 'hedge')).toBe(true)
    }
    expect(findViolations('a pendingly thing', options)).toEqual([])
  })

  it('flags email', () => {
    expect(scanHtml(fixture('email.html'), options)).toContainEqual({ rule: 'email', match: 'a@b.com' })
  })

  it('flags em dashes but not en dashes', () => {
    expect(scanHtml('<p>Fast \u2014 and clear.</p>', options)).toContainEqual({ rule: 'emdash', match: '\u2014' })
    expect(findViolations('pages 1\u20132', options)).toEqual([])
  })

  it('flags location words and coordinate pairs but not versions', () => {
    expect(findViolations('Based in Ashburn', options)).toContainEqual({ rule: 'location', match: 'Ashburn' })
    expect(findViolations('at 39.05188, -77.454014 now', options)).toContainEqual({
      rule: 'location',
      match: '39.05188, -77.454014',
    })
    expect(findViolations('astro 7.4.5 and 5.9.3', options)).toEqual([])
  })

  it('ships 13 well-formed employer digests', () => {
    expect(EMPLOYER_DIGESTS).toHaveLength(13)
    for (const entry of EMPLOYER_DIGESTS) expect(entry).toMatch(/^[0-9a-f]{64}$/)
  })

  it('model has no copy violations', () => {
    const strings: string[] = []
    const walk = (value: unknown, key?: string): void => {
      if (key === 'href' || key === 'url') return
      if (typeof value === 'string') strings.push(value)
      else if (Array.isArray(value)) value.forEach((item) => walk(item))
      else if (value && typeof value === 'object') {
        for (const [childKey, child] of Object.entries(value)) walk(child, childKey)
      }
    }
    walk(model)
    expect(strings.length).toBeGreaterThan(0)
    const found = strings.flatMap((text) => findViolations(text).map((v) => `${v.rule}: ${v.match}`))
    expect(found).toEqual([])
  })
})

describe('scanHtml non-text sources', () => {
  const acme = { rule: 'employer', match: 'Acme Corp' }
  const page = (body: string, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
  const attributeCases: [string, string][] = [
    ['alt', '<img src="/a.png" alt="Acme Corp logo">'],
    ['title attribute', '<a href="/x" title="Acme Corp">x</a>'],
    ['aria-label', '<button aria-label="Acme Corp">x</button>'],
    ['aria-description', '<div aria-description="Acme Corp">x</div>'],
    ['placeholder', '<input placeholder="Acme Corp">'],
    ['input value', "<input value='Acme Corp'>"],
    ['button value', '<button value=Acme>go</button>'],
  ]
  it.each(attributeCases)('scans %s', (_name, body) => {
    expect(scanHtml(page(body), options).some((v) => v.rule === 'employer')).toBe(true)
  })

  it('does not scan value on other elements', () => {
    expect(scanHtml(page('<li value="Acme Corp">x</li>'), options)).toEqual([])
  })

  const metaKeys = ['description', 'og:title', 'og:description', 'og:site_name', 'og:image:alt', 'twitter:title', 'twitter:description']
  it.each(metaKeys)('scans meta %s', (key) => {
    const attribute = key.startsWith('og:') ? 'property' : 'name'
    const head = `<meta ${attribute}="${key}" content="Acme Corp">`
    expect(scanHtml(page('<p>x</p>', head), options)).toContainEqual(acme)
  })

  it('ignores meta content for other names', () => {
    expect(scanHtml(page('<p>x</p>', '<meta name="generator" content="Acme Corp">'), options)).toEqual([])
  })

  it('scans the title element', () => {
    expect(scanHtml(page('<p>x</p>', '<title>Acme Corp</title>'), options)).toContainEqual(acme)
  })

  it('scans ld+json string values but not URLs', () => {
    const ld = (json: object) => `<script type="application/ld+json">${JSON.stringify(json)}</script>`
    expect(scanHtml(page('<p>x</p>', ld({ description: 'Acme Corp' })), options)).toContainEqual(acme)
    expect(scanHtml(page('<p>x</p>', ld({ sameAs: ['https://github.com/acme'] })), options)).toEqual([])
  })

  it('still skips other scripts, styles, href and src', () => {
    const head = '<script>var a = "Acme Corp"</script><style>.a{content:"Acme Corp"}</style>'
    expect(scanHtml(page('<a href="/acme">x</a><img src="/acme.png">', head), options)).toEqual([])
  })
})

describe('copy-scan cli', () => {
  const run = (directory: string) => spawnSync('node', ['scripts/gates/copy-scan.ts', directory], { encoding: 'utf8' })

  it('exits 2 when the directory is missing', () => {
    expect(run('does-not-exist-dir').status).toBe(2)
  })

  it('exits 0 on clean output and 1 with file: rule: match on a violation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'copy-scan-'))
    writeFileSync(join(directory, 'a.html'), fixture('clean.html'))
    expect(run(directory).status).toBe(0)
    writeFileSync(join(directory, 'b.html'), fixture('email.html'))
    const result = run(directory)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('b.html: email: a@b.com')
  })
})
