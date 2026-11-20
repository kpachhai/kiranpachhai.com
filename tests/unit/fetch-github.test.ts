import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findViolations } from '../../scripts/gates/copy-scan'
import { EMPLOYER_DIGESTS } from '../../scripts/gates/copy-rules'
import { fetchGithubData, loadGithubData, runCli } from '../../scripts/data/fetch-github'
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

function makeFetch() {
  const urls: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    if (url.includes('/graphql')) {
      const data: Record<string, unknown> = {}
      const query = JSON.parse(String(init?.body)).query as string
      if (query.includes('DISCUSSION')) {
        return json({
          data: {
            authored: { nodes: [{ repository: { nameWithOwner: 'ava-labs/hypersdk', isPrivate: false } }] },
            commented: { nodes: [{ repository: { nameWithOwner: 'someone/unmapped-repo', isPrivate: false } }, { repository: { nameWithOwner: 'MetaMask/snaps', isPrivate: true } }] },
          },
        })
      }
      for (const alias of query.match(/y\d{4}/g) ?? []) {
        data[alias] = {
          commitContributionsByRepository: [
            { repository: { nameWithOwner: 'a/pub', isPrivate: false, owner: { login: 'a' } }, contributions: { totalCount: 10 } },
            { repository: { nameWithOwner: 'hashgraph/hedera-docs', isPrivate: false, owner: { login: 'hashgraph' } }, contributions: { totalCount: 3 } },
            { repository: { nameWithOwner: 'a/priv', isPrivate: true, owner: { login: 'a' } }, contributions: { totalCount: 99 } },
            { repository: { nameWithOwner: 'kpachhai/own', isPrivate: false, owner: { login: 'kpachhai' } }, contributions: { totalCount: 77 } },
          ],
        }
      }
      return json({ data: { user: data } })
    }
    const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '')
    const wantsItems = new URL(url).searchParams.get('per_page') !== '1'
    const items = query.includes('reviewed-by:') ? reviewItems : prItems
    return json({ total_count: countFor(query), items: wantsItems ? items : [] })
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

  it('has no ledger label that violates the copy rules', () => {
    const labels = [...Object.values(UPSTREAM_MAP).map((entry) => entry.label), ...loadGithubData({ livePath: '/nonexistent' }).ledger.map((entry) => entry.label)]
    for (const label of labels) {
      expect(findViolations(label, { employerDigests: EMPLOYER_DIGESTS }), label).toEqual([])
    }
  })
})
