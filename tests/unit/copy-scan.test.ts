import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { COMPOUND_DIGESTS, EMPLOYER_DIGESTS, HEDGES } from '../../scripts/gates/copy-rules'
import { DEFAULT_EMPLOYER_DIGESTS, InvalidJsonLd, findViolations, scanHtml, scanJs } from '../../scripts/gates/copy-scan'

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

  it('reads a whole attribute value that contains ">"', () => {
    expect(scanHtml(page('<a href="/x" title="a > Acme Corp">x</a>'), options)).toContainEqual(acme)
    // Nothing after the ">" leaks into the visible text either.
    expect(scanHtml(page('<a href="/x" data-note="1 > Acme Corp">x</a>'), options)).toEqual([])
  })

  it('never reads tag-like strings inside a script body as markup', () => {
    const body = '<script>const html = \'<img alt="Acme Corp">\'; const t = "<b title=\\"Acme\\">"</script><p>clean</p>'
    expect(scanHtml(page(body), options)).toEqual([])
  })

  it('catches a term split across inline markup, once', () => {
    expect(scanHtml(page('<p>Ac<b>me</b> wrote it</p>'), options)).toEqual([{ rule: 'employer', match: 'Acme' }])
    expect(scanHtml(page('<p>Acme team</p>'), options)).toEqual([{ rule: 'employer', match: 'Acme' }])
  })

  it('treats a plural as the term', () => {
    expect(findViolations('two Acmes met', options)).toEqual([{ rule: 'employer', match: 'Acmes' }])
  })

  it('throws a named error on invalid ld+json', () => {
    const broken = page('<p>x</p>', '<script type="application/ld+json">{"name": </script>')
    expect(() => scanHtml(broken, options)).toThrow(InvalidJsonLd)
  })
})

// A product name can run an employer term into another word: at a case break the scan reads
// the parts, and a one-word compound with no break is listed by its own digest.
describe('employer terms inside one-word names', () => {
  it('reads a compound at its case breaks and reports the whole word', () => {
    expect(findViolations('runs on AcmeVM today', options)).toEqual([{ rule: 'employer', match: 'AcmeVM' }])
    expect(findViolations('the AcmeCorpHub app', options)).toEqual([{ rule: 'employer', match: 'AcmeCorpHub' }])
    expect(findViolations('MyAcme2', options)).toEqual([{ rule: 'employer', match: 'MyAcme2' }])
  })

  it('leaves words without a break, and unrelated compounds, alone', () => {
    expect(findViolations('an Academy on macOS with JavaScript', options)).toEqual([])
    expect(findViolations('acmevm', options)).toEqual([])
  })

  it('flags a listed one-word compound with no case break', () => {
    expect(findViolations('runs acmevm', { employerDigests: [digest('acmevm')] })).toEqual([{ rule: 'employer', match: 'acmevm' }])
  })

  it('ships well-formed compound digests that the default scan uses', () => {
    expect(COMPOUND_DIGESTS.length).toBeGreaterThan(0)
    for (const entry of COMPOUND_DIGESTS) {
      expect(entry).toMatch(/^[0-9a-f]{64}$/)
      expect(EMPLOYER_DIGESTS).not.toContain(entry)
      expect(DEFAULT_EMPLOYER_DIGESTS).toContain(entry)
    }
    for (const entry of EMPLOYER_DIGESTS) expect(DEFAULT_EMPLOYER_DIGESTS).toContain(entry)
  })
})

describe('JSON data and built JavaScript', () => {
  it('scans a JSON data block in a page, but not its URLs', () => {
    const data = (json: object) => `<p>x</p><script type="application/json" id="island-data">${JSON.stringify(json)}</script>`
    expect(scanHtml(data({ domains: [{ label: 'Acme Corp' }] }), options)).toContainEqual({ rule: 'employer', match: 'Acme Corp' })
    expect(scanHtml(data({ href: 'https://github.com/acme/repo' }), options)).toEqual([])
    expect(() => scanHtml('<script type="application/json">{"a": </script>', options)).toThrow(InvalidJsonLd)
  })

  it('scans string literals in a bundle, decoding escapes', () => {
    expect(scanJs('const a="Acme Corp";', options)).toContainEqual({ rule: 'employer', match: 'Acme Corp' })
    expect(scanJs("el('span',{},['\\u0041cme team'])", options)).toContainEqual({ rule: 'employer', match: 'Acme' })
    expect(scanJs('const t=`by ${who}, AcmeVM`', options)).toContainEqual({ rule: 'employer', match: 'AcmeVM' })
    expect(scanJs('const s="draft"', options)).toContainEqual({ rule: 'hedge', match: 'draft' })
    expect(scanJs('const s="Fast \\u2014 clear"', options)).toContainEqual({ rule: 'emdash', match: '\u2014' })
    expect(scanJs('function acme(corp){return corp+1}', options)).toEqual([])
  })
})

describe('copy-scan cli', () => {
  const run = (directory: string) => spawnSync('node', ['scripts/gates/copy-scan.ts', directory], { encoding: 'utf8' })

  it('exits 2 when the directory is missing', () => {
    expect(run('does-not-exist-dir').status).toBe(2)
  })

  it('exits 2 when the directory holds no .html or .js file to scan', () => {
    const directory = mkdtempSync(join(tmpdir(), 'copy-scan-empty-'))
    const empty = run(directory)
    expect(empty.status).toBe(2)
    expect(empty.stderr).toContain('nothing was scanned')
    writeFileSync(join(directory, 'notes.txt'), 'an illustrative note')
    expect(run(directory).status).toBe(2)
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

  it('scans built JavaScript files and names the file on a violation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'copy-scan-'))
    writeFileSync(join(directory, 'a.html'), fixture('clean.html'))
    writeFileSync(join(directory, 'island.js'), 'export const note = "an illustrative figure"\n')
    const result = run(directory)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('island.js: hedge: illustrative')
  })

  it('exits 2 and names the file when its ld+json is invalid', () => {
    const directory = mkdtempSync(join(tmpdir(), 'copy-scan-'))
    writeFileSync(join(directory, 'a.html'), fixture('clean.html'))
    writeFileSync(join(directory, 'broken.html'), '<html><head><script type="application/ld+json">{"name": </script></head><body>x</body></html>')
    const result = run(directory)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('broken.html: invalid ld+json')
  })
})
