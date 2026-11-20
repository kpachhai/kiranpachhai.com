import { mkdtempSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findViolations } from '../../scripts/gates/copy-scan'
import { EMPLOYER_DIGESTS } from '../../scripts/gates/copy-rules'
import { COUNT_QUERIES, countSearchUrl, fetchGithubData, loadGithubData, runCli, writeAtomically } from '../../scripts/data/fetch-github'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'
import { UpstreamSchema } from '../../src/model/schema'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const COUNTS: Record<string, number> = { 'is:issue': 632, 'reviewed-by': 178, 'commenter': 462, 'is:pr': 61 }

function countFor(query: string): number {
  if (query.includes('reviewed-by:')) return COUNTS['reviewed-by']
  if (query.includes('commenter:')) return COUNTS.commenter
  if (query.includes('is:issue')) return COUNTS['is:issue']
  return COUNTS['is:pr']
}

const prItems = [
  { repository_url: 'https://api.github.com/repos/hashgraph/hedera-docs', state: 'closed', pull_request: { merged_at: '2026-01-09T00:00:00Z' } },
  { repository_url: 'https://api.github.com/repos/someone/unmapped-repo', state: 'closed', pull_request: { merged_at: '2026-01-09T00:00:00Z' } },
  { repository_url: 'https://api.github.com/repos/hiero-ledger/hiero-json-rpc-relay', state: 'closed', pull_request: { merged_at: null } },
  { repository_url: 'https://api.github.com/repos/hashgraph/hedera-docs', state: 'open', pull_request: { merged_at: null } },
]
const reviewItems = [
  { repository_url: 'https://api.github.com/repos/hashgraph/hedera-metamask-snaps', state: 'closed', pull_request: { merged_at: null } },
  { repository_url: 'https://api.github.com/repos/someone/unmapped-repo', state: 'closed', pull_request: { merged_at: null } },
]

const filler = { repository_url: 'https://api.github.com/repos/someone/unmapped-repo', state: 'closed', pull_request: { merged_at: null } }

function makeFetch() {
  const urls: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    if (url.includes('/graphql')) {
      const data: Record<string, unknown> = {}
      const query = JSON.parse(String(init?.body)).query as string
      if (query.includes('DISCUSSION')) {
        const nodes = query.includes('author:')
          ? [{ repository: { nameWithOwner: 'ava-labs/hypersdk', isPrivate: false } }]
          : [{ repository: { nameWithOwner: 'someone/unmapped-repo', isPrivate: false } }, { repository: { nameWithOwner: 'MetaMask/snaps', isPrivate: true } }]
        return json({ data: { discussions: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } })
      }
      for (const alias of query.match(/y\d{4}/g) ?? []) {
        data[alias] = {
          commitContributionsByRepository: [
            { repository: { nameWithOwner: 'a/pub', isPrivate: false, owner: { login: 'a' } }, contributions: { totalCount: 10 } },
            { repository: { nameWithOwner: 'hashgraph/hedera-docs', isPrivate: false, owner: { login: 'hashgraph' } }, contributions: { totalCount: 3 } },
            { repository: { nameWithOwner: 'a/priv', isPrivate: true, owner: { login: 'a' } }, contributions: { totalCount: 99 } },
            { repository: { nameWithOwner: 'kpachhai/own', isPrivate: false, owner: { login: 'kpachhai' } }, contributions: { totalCount: 77 } },
            { repository: { nameWithOwner: 'KPachhai/own-mixed-case', isPrivate: false, owner: { login: 'KPachhai' } }, contributions: { totalCount: 55 } },
          ],
        }
      }
      return json({ data: { user: data } })
    }
    const params = new URL(url).searchParams
    const query = decodeURIComponent(params.get('q') ?? '')
    const total = countFor(query)
    if (params.get('per_page') === '1') return json({ total_count: total, incomplete_results: false, items: [] })
    // The fixture items, padded with unmapped PRs so every counted item arrives, served by page.
    const fixture = query.includes('reviewed-by:') ? reviewItems : prItems
    const all = [...fixture, ...Array.from({ length: total - fixture.length }, () => filler)]
    const page = Number(params.get('page'))
    return json({ total_count: total, incomplete_results: false, items: all.slice((page - 1) * 100, page * 100) })
  })
  return { impl: impl as unknown as typeof fetch, urls }
}

describe('fetchGithubData', () => {
  it('scopes every search to public repos that are not the owner\'s', async () => {
    const { impl, urls } = makeFetch()
    await fetchGithubData(impl, 'token')
    const searches = urls.filter((url) => url.includes('/search/issues'))
    expect(searches.length).toBeGreaterThanOrEqual(4)
    for (const url of searches) {
      expect(url).toContain('is%3Apublic')
      expect(url).toContain('-user%3Akpachhai')
    }
  })

  it('runs each search once: the authored-PR pages also give the authored count', async () => {
    const { impl, urls } = makeFetch()
    await fetchGithubData(impl, 'token')
    const firstPages = urls
      .filter((url) => url.includes('/search/issues'))
      .map((url) => new URL(url).searchParams)
      .filter((params) => params.get('page') === '1')
      .map((params) => params.get('q'))
    expect(firstPages).toHaveLength(4)
    expect(new Set(firstPages).size).toBe(firstPages.length)
  })

  it('links each count to the same search it runs', () => {
    for (const key of Object.keys(COUNT_QUERIES) as (keyof typeof COUNT_QUERIES)[]) {
      const link = new URL(countSearchUrl(key))
      expect(link.origin + link.pathname).toBe('https://github.com/search')
      expect(link.searchParams.get('q')).toBe(`${COUNT_QUERIES[key].terms} is:public -user:kpachhai`)
    }
  })

  it('returns finite positive integer counts', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    expect(data.counts).toEqual({ prsAuthored: 61, prsReviewed: 178, issues: 632, commented: 462 })
    for (const value of Object.values(data.counts)) {
      expect(Number.isInteger(value) && value > 0).toBe(true)
    }
  })

  it('keeps only mapped repos in the ledger', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    const hrefs = data.ledger.map((entry) => entry.href)
    expect(hrefs).toContain('https://github.com/hashgraph/hedera-docs')
    expect(hrefs.some((href) => href.includes('unmapped-repo'))).toBe(false)
    for (const entry of data.ledger) expect(() => UpstreamSchema.parse(entry)).not.toThrow()
    expect(data.ledger.find((entry) => entry.href.includes('hedera-docs') && entry.status === 'merged')).toBeDefined()
  })

  it('lists a merged and an open entry for one repo', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    const docs = data.ledger.filter((entry) => entry.href.includes('hedera-docs') && entry.status !== 'commits')
    expect(docs.map((entry) => entry.status).sort()).toEqual(['merged', 'open'])
  })

  it('drops closed-unmerged PRs instead of labelling them review', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    expect(data.ledger.some((entry) => entry.href.includes('json-rpc-relay'))).toBe(false)
  })

  it('adds review entries from reviewed PRs in mapped repos only', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    const reviews = data.ledger.filter((entry) => entry.status === 'review')
    expect(reviews.map((entry) => entry.href)).toEqual(['https://github.com/hashgraph/hedera-metamask-snaps'])
  })

  it('adds discussion entries from public discussions in mapped repos only', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    const discussions = data.ledger.filter((entry) => entry.status === 'discussion')
    expect(discussions.map((entry) => entry.href)).toEqual(['https://github.com/ava-labs/hypersdk'])
  })

  it('adds commits entries for mapped public repos from the commit years', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    const commits = data.ledger.filter((entry) => entry.status === 'commits')
    expect(commits.map((entry) => entry.href)).toEqual(['https://github.com/hashgraph/hedera-docs'])
  })

  it('sums public, non-owner commits per year', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    expect(data.commitsByYear['2019']).toBe(13)
    expect(data.commitsByYear['2026']).toBe(13)
  })

  it('rejects on an HTTP error', async () => {
    const impl = (async () => json({ message: 'rate limited' }, 403)) as unknown as typeof fetch
    await expect(fetchGithubData(impl, 'token')).rejects.toThrow()
  })

  it('rejects on a non-integer count', async () => {
    const impl = (async () => json({ total_count: 'many', items: [] })) as unknown as typeof fetch
    await expect(fetchGithubData(impl, 'token')).rejects.toThrow()
  })

  it('rejects a search GitHub marks as incomplete', async () => {
    const { impl: base } = makeFetch()
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await base(input, init)
      if (!String(input).includes('/search/issues')) return response
      return json({ ...(await response.json()), incomplete_results: true })
    }) as typeof fetch
    await expect(fetchGithubData(impl, 'token')).rejects.toThrow(/incomplete/)
  })

  it('reads every page of a search whose total passes 100, and rejects one that comes back short', async () => {
    const reviewed = Array.from({ length: 150 }, () => reviewItems[0])
    const pagesAsked: string[] = []
    const make = (served: number) => {
      const { impl: base } = makeFetch()
      return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        const query = url.searchParams.get('q') ?? ''
        if (!url.pathname.includes('/search/issues') || !query.includes('reviewed-by:')) return base(input, init)
        const page = Number(url.searchParams.get('page'))
        pagesAsked.push(String(page))
        const items = reviewed.slice(0, served).slice((page - 1) * 100, page * 100)
        return json({ total_count: 150, incomplete_results: false, items })
      }) as typeof fetch
    }
    const data = await fetchGithubData(make(150), 'token')
    expect(pagesAsked).toEqual(['1', '2'])
    expect(data.counts.prsReviewed).toBe(150)
    await expect(fetchGithubData(make(120), 'token')).rejects.toThrow(/120 of 150/)
  })

  it('pages through discussions with the cursor', async () => {
    const { impl: base } = makeFetch()
    const discussionQueries: string[] = []
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const query = init?.body ? (JSON.parse(String(init.body)).query as string) : ''
      if (!query.includes('DISCUSSION') || !query.includes('author:')) return base(input, init)
      discussionQueries.push(query)
      const first = !query.includes('after:')
      const nodes = first ? [] : [{ repository: { nameWithOwner: 'ava-labs/hypersdk', isPrivate: false } }]
      return json({ data: { discussions: { pageInfo: { hasNextPage: first, endCursor: first ? 'CURSOR1' : null }, nodes } } })
    }) as typeof fetch
    const data = await fetchGithubData(impl, 'token')
    expect(discussionQueries).toHaveLength(2)
    expect(discussionQueries[1]).toContain('after: "CURSOR1"')
    expect(data.ledger.filter((entry) => entry.status === 'discussion').map((entry) => entry.href)).toEqual(['https://github.com/ava-labs/hypersdk'])
  })

  it('leaves out the owner\'s own repos whatever the login case', async () => {
    const { impl } = makeFetch()
    const data = await fetchGithubData(impl, 'token')
    // 10 (a/pub) + 3 (hashgraph/hedera-docs); kpachhai/own and KPachhai/own-mixed-case are the owner's.
    expect(data.commitsByYear['2020']).toBe(13)
  })
})

describe('runCli', () => {
  const failing = (status: number) => (async () => json({}, status)) as unknown as typeof fetch

  it.each([403, 500])('writes nothing and exits 0 on HTTP %i; loader falls back to snapshot', async (status) => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const code = await runCli({ fetchImpl: failing(status), token: 'token', outPath: out })
    warn.mockRestore()
    expect(code).toBe(0)
    expect(existsSync(out)).toBe(false)
    const loaded = loadGithubData({ livePath: out })
    expect(loaded.counts.prsAuthored).toBe(61)
  })

  it('exits 0 with a warning and writes nothing when no token is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const code = await runCli({ fetchImpl: makeFetch().impl, token: undefined, outPath: out })
    warn.mockRestore()
    expect(code).toBe(0)
    expect(existsSync(out)).toBe(false)
  })

  // One request failing, early or late, must leave the existing file exactly as it was.
  it.each([
    ['the late GraphQL commit query', (url: string, body: string) => url.includes('/graphql') && body.includes('contributionsCollection')],
    ['a single search', (url: string) => url.includes('/search/issues') && decodeURIComponent(url).includes('commenter:')],
    ['the discussion query', (url: string, body: string) => url.includes('/graphql') && body.includes('DISCUSSION')],
  ])('keeps an existing github.json untouched when %s fails', async (_name, failsOn) => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const before = '{"existing":true}\n'
    writeFileSync(out, before)
    const { impl: base } = makeFetch()
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      failsOn(String(input), String(init?.body ?? '')) ? json({}, 500) : base(input, init)) as typeof fetch
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const code = await runCli({ fetchImpl: impl, token: 'token', outPath: out })
    warn.mockRestore()
    expect(code).toBe(0)
    expect(readFileSync(out, 'utf8')).toBe(before)
    expect(readdirSync(dir)).toEqual(['github.json'])
  })

  it('writes through a temporary file and leaves none behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    writeFileSync(out, '{"old":true}\n')
    await runCli({ fetchImpl: makeFetch().impl, token: 'token', outPath: out })
    expect(readdirSync(dir)).toEqual(['github.json'])
    expect(JSON.parse(readFileSync(out, 'utf8')).counts.prsAuthored).toBe(61)
  })

  it('writes a temporary file, then renames it over the target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const calls: string[] = []
    writeAtomically(out, '{"new":true}\n', {
      writeFileSync: (path, text) => {
        calls.push(`write ${path === out ? 'target' : path.endsWith('.tmp') && path.startsWith(out) ? 'temp' : path}`)
        writeFileSync(path, text)
      },
      renameSync: (from, to) => {
        calls.push(`rename ${from.endsWith('.tmp') ? 'temp' : from} -> ${to === out ? 'target' : to}`)
        renameSync(from, to)
      },
    })
    expect(calls).toEqual(['write temp', 'rename temp -> target'])
    expect(readFileSync(out, 'utf8')).toBe('{"new":true}\n')
  })

  it('leaves the old file intact and no temporary file when the write crashes part way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const before = '{"old":true}\n'
    writeFileSync(out, before)
    const crash = () =>
      writeAtomically(out, '{"new":true,"counts":{}}\n', {
        // Half the bytes land, then the process "dies".
        writeFileSync: (path, text) => {
          writeFileSync(path, text.slice(0, 8))
          throw new Error('disk full')
        },
        renameSync,
      })
    expect(crash).toThrow('disk full')
    expect(readFileSync(out, 'utf8')).toBe(before)
    expect(readdirSync(dir)).toEqual(['github.json'])
  })

  it('falls back to the snapshot when the live file is truncated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    writeFileSync(out, '{"asOf": "2026-')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loaded = loadGithubData({ livePath: out })
    warn.mockRestore()
    expect(loaded.counts.prsAuthored).toBe(61)
  })

  it('writes the file on full success and the loader prefers it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const out = join(dir, 'github.json')
    const code = await runCli({ fetchImpl: makeFetch().impl, token: 'token', outPath: out })
    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(out, 'utf8')).counts.prsAuthored).toBe(61)
    expect(loadGithubData({ livePath: out }).counts.issues).toBe(632)
  })

  it('never prints the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-'))
    const spies = [vi.spyOn(console, 'warn'), vi.spyOn(console, 'log'), vi.spyOn(console, 'error')]
    spies.forEach((spy) => spy.mockImplementation(() => {}))
    await runCli({ fetchImpl: failing(500), token: 'secret-token-value', outPath: join(dir, 'x.json') })
    const printed = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n')
    spies.forEach((spy) => spy.mockRestore())
    expect(printed).not.toContain('secret-token-value')
  })
})

describe('snapshot and map', () => {
  it('loads the committed snapshot values', () => {
    const data = loadGithubData({ livePath: join(tmpdir(), 'does-not-exist.json') })
    expect(data.counts).toEqual({ prsAuthored: 61, prsReviewed: 178, issues: 632, commented: 462 })
    expect(data.ledger.length).toBeGreaterThan(0)
  })

  it('labels each repo without a status word, and the snapshot uses the map labels', () => {
    for (const [repo, entry] of Object.entries(UPSTREAM_MAP)) {
      expect(entry.label, repo).not.toMatch(/\b(discussions?|merged|open|commits?|reviews?|reviewed|fix(es)?)\b/i)
    }
    for (const entry of loadGithubData({ livePath: '/nonexistent' }).ledger) {
      const repo = entry.href.replace('https://github.com/', '')
      expect(entry.label, repo).toBe(UPSTREAM_MAP[repo]?.label)
    }
  })

  it('names the HyperSDK repo as the model and the toolkit do', () => {
    expect(UPSTREAM_MAP['ava-labs/hypersdk']?.label).toBe('HyperSDK')
  })

  it('has no ledger label or pinned-link note that violates the copy rules', () => {
    const labels = [
      ...Object.values(UPSTREAM_MAP).flatMap((entry) => [entry.label, ...(entry.links ?? []).map((link) => link.note)]),
      ...loadGithubData({ livePath: '/nonexistent' }).ledger.map((entry) => entry.label),
    ]
    for (const label of labels) {
      expect(findViolations(label, { employerDigests: EMPLOYER_DIGESTS }), label).toEqual([])
    }
  })
})
