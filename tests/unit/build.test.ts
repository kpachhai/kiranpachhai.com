import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// dist/ is built once by tests/unit/build-once.ts (vitest globalSetup).
const dist = join(process.cwd(), 'dist')

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

describe('astro build', () => {
  it('keeps the CNAME file byte for byte', () => {
    expect(readFileSync(join(dist, 'CNAME'), 'utf8')).toBe('kiranpachhai.com\n')
  })

  it('renders an English document', () => {
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('<html lang="en">')
  })

  it('contains nothing from the old CRA build', () => {
    expect(existsSync(join(dist, 'asset-manifest.json'))).toBe(false)
    expect(existsSync(join(dist, 'static', 'js'))).toBe(false)
    const leftovers = listFiles(dist).filter((file) => /asset-manifest|[\\/]static[\\/]js[\\/]/.test(file))
    expect(leftovers).toEqual([])
  })
})

// Owner ruling: no HIP proposal or review anywhere on the site, including copy written straight
// into components. Link targets may carry a repo slug; nothing visible or linked may name a HIP.
describe('built pages and HIP content', () => {
  const pages = listFiles(dist).filter((file) => file.endsWith('.html'))
  const withoutLinkTargets = (html: string) =>
    html.replace(/\b(?:href|src)="[^"]*"/g, '').replace(/&quot;(?:href|url)&quot;:&quot;.*?&quot;|"(?:href|url)":"[^"]*"/g, '')

  it('name no HIP number or HIP authorship or review outside link targets', () => {
    for (const file of pages) {
      const text = withoutLinkTargets(readFileSync(file, 'utf8'))
      expect(text.match(/\bHIP[-\s]?\d{1,4}\b/i)?.[0], file).toBeUndefined()
      expect(text.match(/co[-\s]?authored\s+HIPs?\b|\bHIPs?\s+(?:proposals?|reviews?|authors?|authorship)\b/i)?.[0], file).toBeUndefined()
    }
  })

  it('link nowhere on the HIP site or the HIP repository', () => {
    for (const file of pages) {
      const html = readFileSync(file, 'utf8')
      expect(html.match(/hips\.hedera\.com|improvement-proposals/)?.[0], file).toBeUndefined()
    }
  })
})

// Private-derived case studies use only the disclosure table's approved wording. Details from
// design notes (a build gate, a governing spec, written lessons) and the unconfirmed "live" claim
// for the course stay off these pages, in the copy and in the diagrams' names and labels.
describe('private-derived case-study pages', () => {
  const OFF_DISCLOSURE: Record<string, RegExp[]> = {
    'cross-ledger-explorer': [/build gate/i, /chain librar/i, /\blibs?\b/i, /accepts/i],
    'plumbing-of-money': [/governing spec/i, /\blessons?\b/i, /\blive\b/i, /goes live/i],
  }
  const visibleText = (html: string) => {
    const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''
    const labels = [...main.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1])
    const text = main.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
    return `${text} ${labels.join(' ')}`
  }

  for (const [slug, patterns] of Object.entries(OFF_DISCLOSURE)) {
    it(`${slug} carries no wording beyond its disclosure row`, () => {
      const text = visibleText(readFileSync(join(dist, 'work', slug, 'index.html'), 'utf8'))
      expect(text.length).toBeGreaterThan(200)
      for (const pattern of patterns) expect(text.match(pattern)?.[0], `${slug} ${pattern}`).toBeUndefined()
    })
  }
})

// Every number on the home page can reveal where it came from: the four upstream counts link
// the GitHub search each one runs, the commit marks link the profile's contribution activity,
// and the hero lines carry the owner source.
describe('home page claims with sources', () => {
  const home = readFileSync(join(dist, 'index.html'), 'utf8')
  const claim = (id: string) => {
    const start = home.indexOf(`data-claim-id="${id}"`)
    expect(start, id).toBeGreaterThan(-1)
    return home.slice(start, start + 2000)
  }

  for (const key of ['prsAuthored', 'prsReviewed', 'issues', 'commented']) {
    it(`the ${key} count links its GitHub search`, () => {
      const block = claim(`upstream-count-${key}`)
      expect(block).toContain('data-claim-source')
      expect(block).toMatch(/href="https:\/\/github\.com\/search\?q=[^"]*is%3Apublic%20-user%3Akpachhai/)
    })
  }

  it('the commit marks link the contribution activity', () => {
    expect(claim('timeline-commits')).toMatch(/data-claim-source[^>]*>\s*<a href="https:\/\/github\.com\/kpachhai"/)
  })

  it('the hero lines carry the owner source', () => {
    expect(claim('hero')).toMatch(/data-source-kind="owner"[^>]*>\s*Owner, \d{4}-\d{2}-\d{2}/)
  })
})

// LinkedIn-sourced items are named, not linked: the only links to the profile are the footer's
// social link and the JSON-LD sameAs. Every other LinkedIn source reads "LinkedIn" as text.
describe('links to LinkedIn', () => {
  const pages = listFiles(dist).filter((file) => file.endsWith('.html'))
  const FOOTER = 'https://www.linkedin.com/in/kiranpachhai'

  it('appear only as the footer link and in sameAs', () => {
    const footerPages: string[] = []
    for (const file of pages) {
      const html = readFileSync(file, 'utf8')
      const hrefs = [...html.matchAll(/href="([^"]*linkedin\.com[^"]*)"/gi)].map((match) => match[1])
      const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? ''
      const footerHrefs = [...footer.matchAll(/href="([^"]*linkedin\.com[^"]*)"/gi)].map((match) => match[1])
      expect(hrefs, file).toEqual(footerHrefs)
      expect(footerHrefs.every((href) => href === FOOTER), file).toBe(true)
      if (footerHrefs.length > 0) footerPages.push(file)
      // Outside hrefs, a profile address may only sit in the ld+json sameAs list.
      const withoutHrefs = html.replace(/href="[^"]*"/g, '')
      const ld = [...withoutHrefs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1])
      const elsewhere = ld.reduce((text, block) => text.replace(block, ''), withoutHrefs)
      expect(elsewhere.match(/linkedin\.com/i)?.[0], file).toBeUndefined()
      for (const block of ld) {
        const sameAs = (JSON.parse(block) as { sameAs?: string[] }).sameAs ?? []
        const mentions = block.match(/linkedin\.com[^"]*/gi) ?? []
        expect(mentions.length, file).toBe(sameAs.filter((entry) => entry.includes('linkedin.com')).length)
      }
    }
    expect(footerPages.length).toBeGreaterThan(0)
  })

  it('leave every LinkedIn source shown as the plain word', () => {
    const home = readFileSync(join(dist, 'index.html'), 'utf8')
    const tags = [...home.matchAll(/data-source-kind="linkedin"[^>]*>([\s\S]*?)<\/span>/g)].map((match) => match[1].trim())
    expect(tags.length).toBeGreaterThan(5)
    expect(tags.every((tag) => tag === 'LinkedIn')).toBe(true)
  })
})
