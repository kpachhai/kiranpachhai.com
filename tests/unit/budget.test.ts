import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { LIMITS, breaches, measureDist, observeRuntime } from '../../scripts/gates/budget'

// Each test writes its own small dist into a temp directory, so no binary fixture is committed.
function makeDist(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), 'budget-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

// Printable text that gzip cannot shrink much: a seeded generator keeps the size stable.
function incompressible(bytes: number): string {
  let seed = 2463534242
  let text = ''
  while (text.length < bytes) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    text += String.fromCharCode(35 + (seed % 90))
  }
  return text
}

const page = (body: string, head = '') => `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`

const runCli = (dist: string) =>
  spawnSync('node', ['--import', './scripts/gates/ts-resolve.mjs', 'scripts/gates/budget.ts', dist, '--no-browser'], { encoding: 'utf8' })

describe('budget gate', () => {
  it('fails a dist that ships a 70 KB JS file', () => {
    const big = incompressible(88_000)
    expect(gzipSync(big, { level: 9 }).length).toBeGreaterThan(70_000)
    const dist = makeDist({ 'index.html': page('<script type="module" src="/_astro/big.js"></script>'), '_astro/big.js': big })

    const measured = measureDist(dist)
    expect(measured.jsTotal).toBeGreaterThan(LIMITS.jsTotal)
    expect(breaches(measured).join('\n')).toMatch(/JS total/)
    expect(breaches(measured).join('\n')).toMatch(/initial route/)
    expect(runCli(dist).status).toBe(1)
  })

  it('passes a small dist', () => {
    const dist = makeDist({ 'index.html': page('<p>hi</p><script type="module" src="/_astro/a.js"></script>'), '_astro/a.js': 'console.log(1)' })
    const result = runCli(dist)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('counts static imports in the initial route and leaves dynamic imports out', () => {
    const dist = makeDist({
      'index.html': page('<script type="module" src="/_astro/entry.js"></script>'),
      '_astro/entry.js': 'import{a}from"./shared.js";const lazy=()=>import("./lazy.js");a(lazy)',
      '_astro/shared.js': `export const a=(x)=>x;/*${incompressible(3_000)}*/`,
      '_astro/lazy.js': `export default 1;/*${incompressible(20_000)}*/`,
    })
    const measured = measureDist(dist)
    expect(measured.jsInitial).toBeGreaterThan(2_000)
    expect(measured.jsInitial).toBeLessThan(10_000)
    expect(measured.jsTotal).toBeGreaterThan(measured.jsInitial + 15_000)
  })

  it('follows root-relative static imports and reports dynamic imports apart from the initial route', () => {
    const dist = makeDist({
      'index.html': page('<script type="module" src="/_astro/entry.js"></script><script type="module">import "/_astro/inline-dep.js"</script>'),
      '_astro/entry.js': 'import{a}from"/_astro/shared.js";const lazy=()=>import(`/_astro/lazy.js`);a(lazy)',
      '_astro/shared.js': `export const a=(x)=>x;/*${incompressible(30_000)}*/`,
      '_astro/inline-dep.js': `export {};/*${incompressible(5_000)}*/`,
      '_astro/lazy.js': `import"./lazy-dep.js";export default 1;/*${incompressible(10_000)}*/`,
      '_astro/lazy-dep.js': `export {};/*${incompressible(20_000)}*/`,
    })
    const measured = measureDist(dist)
    // shared.js (about 24 KB gzip) and inline-dep.js (about 4 KB) load with the page.
    expect(measured.jsInitial).toBeGreaterThan(28_000)
    expect(measured.jsInitial).toBeLessThan(31_000)
    // lazy.js and its static import lazy-dep.js load on demand: about 24 KB, outside the initial figure.
    expect(measured.jsDeferred).toBeGreaterThan(23_000)
    expect(measured.jsDeferred).toBeLessThan(26_000)
    expect(measured.jsTotal).toBeGreaterThan(measured.jsInitial + measured.jsDeferred - 1)
    expect(breaches(measured)).toEqual([])
  })

  it('follows dynamic imports inside deferred modules into the deferred figure', () => {
    const dist = makeDist({
      'index.html': page('<script type="module" src="/_astro/entry.js"></script>'),
      '_astro/entry.js': 'const lazy=()=>import("./lazy.js");lazy()',
      '_astro/lazy.js': 'export const deeper=()=>import("./deeper.js")',
      '_astro/deeper.js': `export default 1;/*${incompressible(20_000)}*/`,
    })
    const measured = measureDist(dist)
    expect(measured.jsDeferred).toBeGreaterThan(15_000)
    expect(measured.jsInitial).toBeLessThan(1_000)
    expect(measured.importWarnings).toEqual([])
  })

  it('follows a relative dynamic import in an inline script into the deferred figure', () => {
    const dist = makeDist({
      'index.html': page('<script type="module">document.body.onclick=()=>import("./_astro/inline-lazy.js")</script>'),
      '_astro/inline-lazy.js': `export default 1;/*${incompressible(20_000)}*/`,
    })
    const measured = measureDist(dist)
    expect(measured.jsDeferred).toBeGreaterThan(15_000)
    expect(measured.jsInitial).toBeLessThan(1_000)
  })

  it('warns about non-literal import() specifiers, naming the file, without failing the budget', () => {
    const dist = makeDist({
      'index.html': page('<script type="module" src="/_astro/entry.js"></script><script type="module">const n="x";import(n)</script>'),
      '_astro/entry.js': 'const load=(name)=>import(`./${name}.js`);load("a");import("./ok.js")',
      '_astro/ok.js': 'export default 1',
    })
    const measured = measureDist(dist)
    expect(measured.importWarnings).toHaveLength(2)
    expect(measured.importWarnings[0]).toMatch(/^_astro\/entry\.js: 1 import\(\) call/)
    expect(measured.importWarnings[1]).toMatch(/^index\.html inline script 1: 1 import\(\) call/)
    expect(breaches(measured)).toEqual([])
    const result = runCli(dist)
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/WARN _astro\/entry\.js/)
  })

  it('measures CSS, font total and preloaded font bytes', () => {
    const dist = makeDist({
      'index.html': page('', '<link rel="preload" href="/fonts/a.woff2" as="font" type="font/woff2" crossorigin>'),
      'fonts/a.woff2': Buffer.alloc(30_000, 1),
      'fonts/b.woff2': Buffer.alloc(90_000, 2),
      '_astro/site.css': `body{color:red}/*${incompressible(25_000)}*/`,
    })
    const measured = measureDist(dist)
    expect(measured.fontsTotal).toBe(120_000)
    expect(measured.fontPreload).toBe(30_000)
    const found = breaches(measured).join('\n')
    expect(found).toMatch(/Fonts total/)
    expect(found).toMatch(/CSS/)
    expect(found).not.toMatch(/preload/)
  })

  it('fails on a third-party resource in built HTML or CSS, and ignores plain links', () => {
    const dist = makeDist({
      'index.html': page('<a href="https://github.com/x">GitHub</a><script src="https://cdn.example.com/x.js"></script>', '<link rel="canonical" href="https://kiranpachhai.com/">'),
      'work/index.html': page('<img src="//images.example.net/p.png" alt="">'),
      '_astro/a.css': '@font-face{src:url(https://fonts.example.org/f.woff2)}',
    })
    const measured = measureDist(dist)
    expect(measured.thirdParty.sort()).toEqual(['//images.example.net/p.png', 'https://cdn.example.com/x.js', 'https://fonts.example.org/f.woff2'])
    expect(runCli(dist).status).toBe(1)
  })

  it('counts canvas elements in built HTML', () => {
    const dist = makeDist({ 'index.html': page('<canvas></canvas><canvas></canvas>') })
    expect(measureDist(dist).canvas).toBe(2)
    expect(breaches(measureDist(dist)).join('\n')).toMatch(/Canvas count/)
  })

  it('measures every built page, not only the home page', () => {
    const dist = makeDist({
      'index.html': page('<p>home</p>'),
      'work/deep/index.html': page('<canvas></canvas><canvas></canvas><img src="https://tracker.example.com/p.gif" alt="">', '<link rel="preload" href="/fonts/big.woff2" as="font" type="font/woff2" crossorigin>'),
      'fonts/big.woff2': Buffer.alloc(45_000, 1),
    })
    const measured = measureDist(dist)
    expect(measured.canvas).toBe(2)
    expect(measured.thirdParty).toEqual(['https://tracker.example.com/p.gif'])
    expect(measured.fontPreload).toBe(45_000)
    const found = breaches(measured).join('\n')
    expect(found).toMatch(/Canvas count/)
    expect(found).toMatch(/Third-party request/)
    expect(found).toMatch(/Fonts preloaded/)
  })

  it('records a third-party request made at runtime from the network log', async () => {
    const dist = makeDist({
      'index.html': page('<p>hi</p><script>new Image().src = "http://third-party.invalid/pixel.gif"</script>'),
    })
    expect(measureDist(dist).thirdParty).toEqual([])
    const runtime = await observeRuntime(dist)
    expect(runtime.thirdParty).toEqual(['http://third-party.invalid/pixel.gif'])
    expect(runtime.canvas).toBe(0)
  }, 60_000)
})
