// Budget gate: measures the built site in dist/ against the performance budget and fails on any
// breach. Sizes are gzip -9 bytes for JS and CSS and file bytes for woff2; 1 KB is 1000 bytes.
// Third-party requests are read twice: statically from the built HTML and CSS, and at runtime from
// a Chromium network log taken while every page loads and every lens on the home page settles.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITS = {
  jsTotal: 60_000,
  jsInitial: 35_000,
  css: 20_000,
  fontsTotal: 110_000,
  fontPreload: 40_000,
  thirdParty: 0,
  canvas: 1,
} as const

export type Measures = {
  jsTotal: number
  jsInitial: number
  // On demand from / (import()); reported, and inside jsTotal, but not part of the initial route.
  jsDeferred: number
  // Files on the route with import() calls whose target cannot be resolved; reported, not a breach.
  importWarnings: string[]
  css: number
  fontsTotal: number
  fontPreload: number
  thirdParty: string[]
  canvas: number
}

export type Runtime = { thirdParty: string[]; canvas: number }

const OWN_HOSTS = new Set(['kiranpachhai.com', 'www.kiranpachhai.com'])
const LENSES = ['plan', 'terrain', 'console', 'index', 'range'] as const
const LOADING_LINK_RELS = /\b(?:stylesheet|preload|modulepreload|prefetch|icon|apple-touch-icon|manifest|preconnect|dns-prefetch)\b/i
const NON_SCRIPT_TYPES = /^(?:application\/(?:ld\+)?json|importmap|speculationrules)$/i

const gzipSize = (content: string | Buffer) => gzipSync(content, { level: 9 }).length

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

const attribute = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((value) => value !== undefined)

const tags = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi')), (found) => found[0])

function inlineScripts(html: string): string[] {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    .filter(([, attrs, body]) => !/\ssrc\s*=/i.test(attrs) && !NON_SCRIPT_TYPES.test(attribute(` ${attrs}`, 'type') ?? '') && body.trim() !== '')
    .map(([, , body]) => body)
}

// A site path such as /_astro/a.js as a file under dist, or null for anything off the site.
function sitePath(dist: string, url: string): string | null {
  if (!url.startsWith('/') || url.startsWith('//')) return null
  const file = resolve(dist, `.${decodeURIComponent(url.split(/[?#]/)[0])}`)
  return file.startsWith(resolve(dist) + sep) ? file : null
}

// Module specifiers on the site: relative (./x.js, ../x.js) or root-relative (/_astro/x.js). A `$`
// marks a template expression, so a specifier holding one is not literal.
const SPECIFIER = String.raw`(\.{1,2}\/[^"'\x60$]+|\/(?!\/)[^"'\x60$]+)`
// Static imports and re-exports load with the page, so they count toward the initial route.
const STATIC_IMPORT = new RegExp(String.raw`(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']${SPECIFIER}["']`, 'g')
// import("...") with a literal specifier loads on demand; it is reported apart from the initial route.
const DYNAMIC_IMPORT = new RegExp(String.raw`\bimport\s*\(\s*["'\x60]${SPECIFIER}["'\x60]\s*\)`, 'g')
const ANY_DYNAMIC_IMPORT = /\bimport\s*\(/g

// A specifier as a file under dist: root-relative against dist, relative against the importer
// (a module file, or the page itself for an inline script).
function moduleFile(dist: string, importer: string, specifier: string): string | null {
  if (specifier.startsWith('/')) return sitePath(dist, specifier)
  const file = resolve(importer, '..', specifier)
  return file.startsWith(resolve(dist) + sep) ? file : null
}

function importsOf(dist: string, importer: string, code: string, patterns: RegExp[]): string[] {
  return patterns
    .flatMap((pattern) => Array.from(code.matchAll(pattern), (found) => moduleFile(dist, importer, found[1])))
    .filter((file): file is string => file !== null)
}

// Every module reachable from the entries through the given import patterns.
function closure(dist: string, entries: string[], patterns: RegExp[]): string[] {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    queue.push(...importsOf(dist, file, readFileSync(file, 'utf8'), patterns))
  }
  return [...seen]
}

// import( calls whose specifier is not a literal site path: their targets cannot be measured.
function nonLiteralImports(code: string): number {
  const literal = new Set(Array.from(code.matchAll(DYNAMIC_IMPORT), (found) => found.index))
  return Array.from(code.matchAll(ANY_DYNAMIC_IMPORT)).filter((found) => !literal.has(found.index)).length
}

const sumFiles = (files: string[]) => files.reduce((sum, file) => sum + gzipSize(readFileSync(file)), 0)

type Route = { initial: number; deferred: number; warnings: string[] }

// The initial route: external and inline scripts, modulepreloads and their static imports. Modules
// reached only through import() from there, at any depth, with their static imports, are the
// deferred figure. Non-literal import() calls in either set come back as warnings.
function routeJs(dist: string, page: string, html: string): Route {
  const inline = inlineScripts(html)
  const external = [
    ...tags(html, 'script').map((tag) => attribute(tag, 'src')),
    ...tags(html, 'link').filter((tag) => /modulepreload/i.test(attribute(tag, 'rel') ?? '')).map((tag) => attribute(tag, 'href')),
  ]
    .map((url) => (url ? sitePath(dist, url) : null))
    .filter((file): file is string => file !== null)
  const initial = closure(dist, [...external, ...inline.flatMap((body) => importsOf(dist, page, body, [STATIC_IMPORT]))], [STATIC_IMPORT])
  const dynamicEntries = [
    ...initial.flatMap((file) => importsOf(dist, file, readFileSync(file, 'utf8'), [DYNAMIC_IMPORT])),
    ...inline.flatMap((body) => importsOf(dist, page, body, [DYNAMIC_IMPORT])),
  ]
  const deferred = closure(dist, dynamicEntries, [STATIC_IMPORT, DYNAMIC_IMPORT]).filter((file) => !initial.includes(file))
  const label = (file: string) => relative(dist, file).split(sep).join('/')
  const warnings = [
    ...[...initial, ...deferred].map((file) => [label(file), nonLiteralImports(readFileSync(file, 'utf8'))] as const),
    ...inline.map((body, index) => [`${label(page)} inline script ${index + 1}`, nonLiteralImports(body)] as const),
  ]
    .filter(([, count]) => count > 0)
    .map(([where, count]) => `${where}: ${count} import() call(s) with a non-literal specifier; their targets are not measured`)
  return { initial: sumFiles(initial) + inline.reduce((sum, body) => sum + gzipSize(body), 0), deferred: sumFiles(deferred), warnings }
}

function preloadedFontBytes(dist: string, html: string): number {
  return tags(html, 'link')
    .filter((tag) => /\bpreload\b/i.test(attribute(tag, 'rel') ?? '') && attribute(tag, 'as') === 'font')
    .map((tag) => sitePath(dist, attribute(tag, 'href') ?? ''))
    .reduce((sum, file) => sum + (file ? statSync(file).size : 0), 0)
}

function isThirdParty(url: string): boolean {
  if (!/^(?:https?:)?\/\//i.test(url)) return false
  const host = new URL(url, 'https://kiranpachhai.com').hostname
  return !OWN_HOSTS.has(host)
}

// URLs the browser fetches on its own: resource attributes, never plain links or canonical URLs.
function htmlRequests(html: string): string[] {
  const urls: (string | undefined)[] = []
  for (const name of ['script', 'img', 'source', 'iframe', 'video', 'audio', 'embed', 'track', 'input']) {
    for (const tag of tags(html, name)) {
      urls.push(attribute(tag, 'src'), attribute(tag, 'poster'))
      urls.push(...(attribute(tag, 'srcset') ?? '').split(',').map((part) => part.trim().split(/\s+/)[0]))
    }
  }
  for (const tag of tags(html, 'object')) urls.push(attribute(tag, 'data'))
  for (const tag of [...tags(html, 'image'), ...tags(html, 'use')]) urls.push(attribute(tag, 'href'), attribute(tag, 'xlink:href'))
  for (const tag of tags(html, 'link')) if (LOADING_LINK_RELS.test(attribute(tag, 'rel') ?? '')) urls.push(attribute(tag, 'href'))
  for (const found of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) urls.push(...cssRequests(found[1]))
  for (const found of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) urls.push(...cssRequests(found[1]))
  return urls.filter((url): url is string => typeof url === 'string' && url !== '')
}

function cssRequests(css: string): string[] {
  return [
    ...Array.from(css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi), (found) => found[1]),
    ...Array.from(css.matchAll(/@import\s+["']([^"']+)["']/gi), (found) => found[1]),
  ]
}

export function measureDist(dist: string): Measures {
  const files = listFiles(dist)
  const pages = files.filter((file) => file.endsWith('.html'))
  const htmlOf = new Map(pages.map((file) => [file, readFileSync(file, 'utf8')]))
  const home = htmlOf.get(join(dist, 'index.html')) ?? ''
  const route = routeJs(dist, join(dist, 'index.html'), home)
  const sumGzip = (ext: string) => files.filter((file) => extname(file) === ext).reduce((sum, file) => sum + gzipSize(readFileSync(file)), 0)
  const uniqueInline = new Set([...htmlOf.values()].flatMap(inlineScripts))
  const requests = [
    ...[...htmlOf.values()].flatMap(htmlRequests),
    ...files.filter((file) => extname(file) === '.css').flatMap((file) => cssRequests(readFileSync(file, 'utf8'))),
  ]
  return {
    jsTotal: sumGzip('.js') + [...uniqueInline].reduce((sum, body) => sum + gzipSize(body), 0),
    jsInitial: route.initial,
    jsDeferred: route.deferred,
    importWarnings: route.warnings,
    css: sumGzip('.css'),
    fontsTotal: files.filter((file) => extname(file) === '.woff2').reduce((sum, file) => sum + statSync(file).size, 0),
    fontPreload: Math.max(0, ...[...htmlOf.values()].map((html) => preloadedFontBytes(dist, html))),
    thirdParty: [...new Set(requests.filter(isThirdParty))],
    canvas: Math.max(0, ...[...htmlOf.values()].map((html) => tags(html, 'canvas').length)),
  }
}

export function breaches(measured: Measures): string[] {
  const over = (label: string, value: number, limit: number) => (value > limit ? [`${label}: ${value} B over the ${limit} B budget`] : [])
  return [
    ...over('JS total (gzip)', measured.jsTotal, LIMITS.jsTotal),
    ...over('JS initial route / (gzip)', measured.jsInitial, LIMITS.jsInitial),
    ...over('CSS total (gzip)', measured.css, LIMITS.css),
    ...over('Fonts total (woff2)', measured.fontsTotal, LIMITS.fontsTotal),
    ...over('Fonts preloaded on one page', measured.fontPreload, LIMITS.fontPreload),
    ...measured.thirdParty.map((url) => `Third-party request: ${url}`),
    ...(measured.canvas > LIMITS.canvas ? [`Canvas count: ${measured.canvas} over the limit of ${LIMITS.canvas}`] : []),
  ]
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain',
}

function serve(dist: string): Promise<Server> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const file = sitePath(dist, path.endsWith('/') ? `${path}index.html` : path)
    let body: Buffer
    try {
      body = readFileSync(file ?? '')
    } catch {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file!)] ?? 'application/octet-stream' }).end(body)
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

const pagePaths = (dist: string) =>
  listFiles(dist)
    .filter((file) => file.endsWith('.html'))
    .map((file) => `/${relative(dist, file).split(sep).join('/')}`.replace(/index\.html$/, ''))

// Loads every page in Chromium, settles each lens where the home bar exists, and records any request
// that leaves the local origin plus the most canvas elements seen at once.
export async function observeRuntime(dist: string): Promise<Runtime> {
  const { chromium } = await import('@playwright/test')
  const server = await serve(dist)
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const browser = await chromium.launch()
  const thirdParty = new Set<string>()
  let canvas = 0
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem('kp-intro-seen', '1')
        window.sessionStorage.setItem('kp-roles-seen', '1')
      } catch {
        // Storage blocked: the intro plays and the lens loop below still waits for each lens.
      }
    })
    context.on('request', (request) => {
      const url = request.url()
      if (/^(?:https?|wss?):/i.test(url) && new URL(url).origin !== origin) thirdParty.add(url)
    })
    const countCanvas = (page: import('@playwright/test').Page) => page.locator('canvas').count()
    for (const path of pagePaths(dist)) {
      const page = await context.newPage()
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
      canvas = Math.max(canvas, await countCanvas(page))
      if ((await page.locator('[data-lens-button]').count()) > 0) {
        await page.locator('html[data-island="ready"]').waitFor({ state: 'attached', timeout: 15_000 })
        for (const lens of LENSES) {
          await page.locator(`[data-lens-button="${lens}"]`).click()
          await page.locator(`#stage[data-settled="${lens}"]`).waitFor({ state: 'attached', timeout: 15_000 })
          await page.waitForLoadState('networkidle')
          canvas = Math.max(canvas, await countCanvas(page))
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
    await new Promise((done) => server.close(done))
  }
  return { thirdParty: [...thirdParty], canvas }
}

function report(measured: Measures): void {
  const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`
  console.log(`JS total (gzip)               ${kb(measured.jsTotal)} of ${kb(LIMITS.jsTotal)}`)
  console.log(`JS initial route / (gzip)     ${kb(measured.jsInitial)} of ${kb(LIMITS.jsInitial)}`)
  console.log(`JS on demand from / (gzip)    ${kb(measured.jsDeferred)} (counted in JS total)`)
  for (const warning of measured.importWarnings) console.log(`WARN ${warning}`)
  console.log(`CSS total (gzip)              ${kb(measured.css)} of ${kb(LIMITS.css)}`)
  console.log(`Fonts total (woff2)           ${kb(measured.fontsTotal)} of ${kb(LIMITS.fontsTotal)}`)
  console.log(`Fonts preloaded on one page   ${kb(measured.fontPreload)} of ${kb(LIMITS.fontPreload)}`)
  console.log(`Third-party requests          ${measured.thirdParty.length} of ${LIMITS.thirdParty}`)
  console.log(`Canvas elements at once       ${measured.canvas} of ${LIMITS.canvas}`)
}

// CLI: budget.ts <dist> [--no-browser]. --no-browser skips the Chromium network log.
export async function main(args: string[]): Promise<number> {
  const dist = resolve(args.find((arg) => !arg.startsWith('--')) ?? 'dist')
  const measured = measureDist(dist)
  if (!args.includes('--no-browser')) {
    const runtime = await observeRuntime(dist)
    measured.thirdParty = [...new Set([...measured.thirdParty, ...runtime.thirdParty])]
    measured.canvas = Math.max(measured.canvas, runtime.canvas)
  }
  report(measured)
  const found = breaches(measured)
  for (const breach of found) console.log(`BREACH ${breach}`)
  return found.length > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)))
}
