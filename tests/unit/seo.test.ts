import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { model } from '../../src/model'

// Builds into its own folder so it never races build.test.ts over dist/.
const out = mkdtempSync(join(tmpdir(), 'seo-dist-'))
const SITE = 'https://kiranpachhai.com'
const MOVED: [string, string][] = [
  ['about', `${SITE}/#timeline`],
  ['portfolio', `${SITE}/#work`],
  ['contact', `${SITE}/`],
]

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return htmlFiles(full)
    return full.endsWith('.html') ? [full] : []
  })
}

const metaContent = (html: string, attr: 'name' | 'property', key: string): string | undefined =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]

const canonicalOf = (html: string) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1]

describe('seo', () => {
  let pages: { file: string; route: string; html: string }[] = []

  beforeAll(() => {
    execSync(`npx astro build --outDir ${out}`, { stdio: 'pipe' })
    pages = htmlFiles(out).map((file) => {
      const route = '/' + file.slice(out.length + 1).replace(/index\.html$/, '')
      return { file, route, html: readFileSync(file, 'utf8') }
    })
  }, 180_000)

  it('finds all eleven pages', () => {
    expect(pages.length).toBe(11)
  })

  it('gives every page its head tags', () => {
    for (const { route, html } of pages) {
      expect(html, route).toMatch(/<title>[^<]+<\/title>/)
      expect(metaContent(html, 'name', 'description'), route).toBeTruthy()
      expect(canonicalOf(html), route).toMatch(/^https:\/\/kiranpachhai\.com\//)
      expect(metaContent(html, 'property', 'og:title'), route).toBeTruthy()
      expect(metaContent(html, 'property', 'og:description'), route).toBeTruthy()
      expect(metaContent(html, 'property', 'og:url'), route).toBe(canonicalOf(html))
      expect(metaContent(html, 'property', 'og:type'), route).toBeTruthy()
      expect(metaContent(html, 'name', 'twitter:card'), route).toBe('summary_large_image')
      expect(metaContent(html, 'property', 'og:image'), route).toMatch(/^https:\/\/kiranpachhai\.com\/og\/[a-z0-9-]+\.png$/)
    }
  })

  it('serves each og:image as a 1200x630 PNG', () => {
    for (const { route, html } of pages) {
      const image = metaContent(html, 'property', 'og:image')!
      const file = join(out, new URL(image).pathname)
      expect(existsSync(file), `${route} -> ${image}`).toBe(true)
      const bytes = readFileSync(file)
      expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
      expect(bytes.readUInt32BE(16)).toBe(1200)
      expect(bytes.readUInt32BE(20)).toBe(630)
    }
  })

  it('maps slugs to images: home, each case study, default', () => {
    const imageOf = (route: string) => metaContent(pages.find((page) => page.route === route)!.html, 'property', 'og:image')
    expect(imageOf('/')).toBe(`${SITE}/og/home.png`)
    for (const study of model.caseStudies) {
      expect(imageOf(`/work/${study.slug}/`)).toBe(`${SITE}/og/${study.slug}.png`)
    }
    expect(imageOf('/404.html')).toBe(`${SITE}/og/default.png`)
  })

  it('emits a Person JSON-LD with name and sameAs only', () => {
    const home = pages.find((page) => page.route === '/')!.html
    const raw = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Kiran Pachhai',
      url: `${SITE}/`,
      sameAs: ['https://github.com/kpachhai', 'https://www.linkedin.com/in/kiranpachhai'],
    })
    for (const { route, html } of pages) {
      expect(html, route).not.toMatch(/"(email|address|telephone|worksFor|jobTitle)"/)
    }
  })

  it('marks moved pages noindex with the right canonical', () => {
    for (const [slug, target] of MOVED) {
      const html = pages.find((page) => page.route === `/${slug}/`)!.html
      expect(html, slug).toContain('<meta name="robots" content="noindex"')
      expect(canonicalOf(html), slug).toBe(target)
    }
  })

  it('lists indexable pages in the sitemap and leaves out moved pages and 404', () => {
    const index = readFileSync(join(out, 'sitemap-index.xml'), 'utf8')
    expect(index).toContain('sitemap-0.xml')
    const sitemap = readFileSync(join(out, 'sitemap-0.xml'), 'utf8')
    const listed = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (found) => found[1]).sort()
    const expected = [`${SITE}/`, ...model.caseStudies.map((study) => `${SITE}/work/${study.slug}/`)].sort()
    expect(listed).toEqual(expected)
  })
})
