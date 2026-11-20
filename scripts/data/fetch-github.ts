import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Upstream } from '../../src/model/schema'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'

export type GithubData = {
  asOf: string
  counts: { prsAuthored: number; prsReviewed: number; issues: number; commented: number }
  ledger: Upstream[]
  commitsByYear: Record<string, number>
}

const OWNER = 'kpachhai'
const PAGE_SIZE = 100
const MAX_PAGES = 10
const FIRST_YEAR = 2019
const SCOPE = `is:public -user:${OWNER}`

// The search behind each upstream count. The fetch runs these, and the Upstream section links the
// same search on GitHub as the count's source.
export const COUNT_QUERIES = {
  prsAuthored: { terms: `author:${OWNER} is:pr`, type: 'pullrequests' },
  prsReviewed: { terms: `reviewed-by:${OWNER} is:pr`, type: 'pullrequests' },
  issues: { terms: `author:${OWNER} is:issue`, type: 'issues' },
  commented: { terms: `commenter:${OWNER}`, type: 'issues' },
} as const

export const countSearchUrl = (key: keyof typeof COUNT_QUERIES): string =>
  `https://github.com/search?q=${encodeURIComponent(`${COUNT_QUERIES[key].terms} ${SCOPE}`)}&type=${COUNT_QUERIES[key].type}`

// Where the per-year commit marks come from: the contribution activity on the owner's profile,
// read through the GraphQL contributionsCollection below.
export const CONTRIBUTIONS_URL = `https://github.com/${OWNER}`
const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const LIVE_PATH = here('../../src/data/github.json')
const SNAPSHOT_PATH = here('../../src/data/github.snapshot.json')

type SearchResponse = { total_count: unknown; incomplete_results?: unknown; items?: SearchItem[] }
type SearchItem = { repository_url: string; state: string; pull_request?: { merged_at: string | null } }

async function getJson(fetchImpl: typeof fetch, url: string, token: string | undefined, init: RequestInit = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!response.ok) throw new Error(`GitHub request failed with HTTP ${response.status}`)
  return response.json()
}

async function search(fetchImpl: typeof fetch, token: string | undefined, terms: string, perPage: number, page = 1) {
  const query = encodeURIComponent(`${terms} ${SCOPE}`)
  const url = `https://api.github.com/search/issues?q=${query}&per_page=${perPage}&page=${page}`
  const response = (await getJson(fetchImpl, url, token)) as SearchResponse
  // GitHub marks a search that timed out before it finished; its counts and items are partial.
  if (response.incomplete_results === true) throw new Error('GitHub search returned incomplete results')
  return response
}

function toCount(response: SearchResponse, name: string): number {
  const value = response.total_count
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name} count from GitHub`)
  }
  return value
}

type Status = Upstream['status']
const STATUS_ORDER: Status[] = ['merged', 'open', 'review', 'discussion', 'commits']

const repoOf = (item: SearchItem) => item.repository_url.replace('https://api.github.com/repos/', '')

// One entry per mapped repo per status. Closed-unmerged PRs have no status and are dropped.
function buildLedger(found: Map<string, Set<Status>>): Upstream[] {
  const entries: Upstream[] = []
  for (const repo of Object.keys(UPSTREAM_MAP)) {
    const statuses = found.get(repo)
    if (!statuses) continue
    const mapped = UPSTREAM_MAP[repo]
    for (const status of STATUS_ORDER) {
      if (!statuses.has(status)) continue
      entries.push({
        label: mapped.label,
        href: `https://github.com/${repo}`,
        status,
        domainId: mapped.domainId,
      })
    }
  }
  return entries
}

function note(found: Map<string, Set<Status>>, repo: string, status: Status) {
  if (!UPSTREAM_MAP[repo]) return
  found.set(repo, (found.get(repo) ?? new Set()).add(status))
}

function noteAuthoredPrs(found: Map<string, Set<Status>>, items: SearchItem[]) {
  for (const item of items) {
    if (item.pull_request?.merged_at) note(found, repoOf(item), 'merged')
    else if (item.state === 'open') note(found, repoOf(item), 'open')
  }
}

async function searchPages(fetchImpl: typeof fetch, token: string | undefined, terms: string) {
  const items: SearchItem[] = []
  let total = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await search(fetchImpl, token, terms, PAGE_SIZE, page)
    total = toCount(response, 'search')
    if (!Array.isArray(response.items)) throw new Error('Missing items from GitHub')
    items.push(...response.items)
    if (response.items.length < PAGE_SIZE || items.length >= total) break
  }
  // Search serves at most MAX_PAGES pages; short of that, every item counted must have arrived.
  if (items.length < Math.min(total, PAGE_SIZE * MAX_PAGES)) {
    throw new Error(`GitHub search returned ${items.length} of ${total} items`)
  }
  return { total, items }
}

type DiscussionNode = { repository?: { nameWithOwner: string; isPrivate: boolean } }
type DiscussionPage = { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes?: DiscussionNode[] }

// Authored and commented discussions, page by page, so more than 100 are never cut off silently.
async function noteDiscussions(fetchImpl: typeof fetch, token: string | undefined, found: Map<string, Set<Status>>) {
  for (const qualifier of ['author', 'commenter']) {
    let after: string | null = null
    for (let page = 1; page <= MAX_PAGES; page++) {
      const cursor = after ? `, after: ${JSON.stringify(after)}` : ''
      const query = `query { discussions: search(query: "${qualifier}:${OWNER} ${SCOPE}", type: DISCUSSION, first: ${PAGE_SIZE}${cursor}) {
      pageInfo { hasNextPage endCursor }
      nodes { ... on Discussion { repository { nameWithOwner isPrivate } } }
    } }`
      const body = (await getJson(fetchImpl, 'https://api.github.com/graphql', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })) as { data?: { discussions?: DiscussionPage }; errors?: unknown }
      if (body.errors || !body.data) throw new Error('Discussion search had errors')
      const result = body.data.discussions
      if (!result || !Array.isArray(result.nodes) || !result.pageInfo) throw new Error('Discussion search missing nodes')
      for (const node of result.nodes) {
        if (node.repository && !node.repository.isPrivate) note(found, node.repository.nameWithOwner, 'discussion')
      }
      if (!result.pageInfo.hasNextPage) break
      if (page === MAX_PAGES || !result.pageInfo.endCursor) throw new Error('Discussion search has more pages than it can read')
      after = result.pageInfo.endCursor
    }
  }
}

type YearNode = {
  commitContributionsByRepository: {
    repository: { nameWithOwner: string; isPrivate: boolean; owner: { login: string } }
    contributions: { totalCount: number }
  }[]
}

async function fetchCommitsByYear(fetchImpl: typeof fetch, token: string | undefined, lastYear: number, found: Map<string, Set<Status>>) {
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index)
  const fields = years
    .map(
      (year) => `y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner isPrivate owner { login } }
          contributions { totalCount }
        }
      }`,
    )
    .join('\n')
  const query = `query { user(login: "${OWNER}") { ${fields} } }`
  const body = (await getJson(fetchImpl, 'https://api.github.com/graphql', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })) as { data?: { user?: Record<string, YearNode> }; errors?: unknown }
  const user = body.data?.user
  if (body.errors || !user) throw new Error('GraphQL response had errors or no user')
  const commitsByYear: Record<string, number> = {}
  for (const year of years) {
    const node = user[`y${year}`]
    if (!node) throw new Error(`GraphQL response missing year ${year}`)
    const publicEntries = node.commitContributionsByRepository.filter(
      // Logins are case-insensitive. Organisations count as upstream even when the owner is a member.
      (entry) => !entry.repository.isPrivate && entry.repository.owner.login.toLowerCase() !== OWNER.toLowerCase(),
    )
    commitsByYear[String(year)] = publicEntries.reduce((sum, entry) => sum + entry.contributions.totalCount, 0)
    for (const entry of publicEntries) note(found, entry.repository.nameWithOwner, 'commits')
  }
  return commitsByYear
}

export async function fetchGithubData(fetchImpl: typeof fetch, token?: string): Promise<GithubData> {
  // The authored-PR search runs once: its pages give the ledger statuses and its total the count.
  const [authored, reviewed, issues, commented] = await Promise.all([
    searchPages(fetchImpl, token, COUNT_QUERIES.prsAuthored.terms),
    searchPages(fetchImpl, token, COUNT_QUERIES.prsReviewed.terms),
    search(fetchImpl, token, COUNT_QUERIES.issues.terms, 1),
    search(fetchImpl, token, COUNT_QUERIES.commented.terms, 1),
  ])
  const found = new Map<string, Set<Status>>()
  noteAuthoredPrs(found, authored.items)
  for (const item of reviewed.items) note(found, repoOf(item), 'review')
  await noteDiscussions(fetchImpl, token, found)
  const now = new Date()
  const commitsByYear = await fetchCommitsByYear(fetchImpl, token, now.getUTCFullYear(), found)
  const counts = {
    prsAuthored: authored.total,
    prsReviewed: reviewed.total,
    issues: toCount(issues, 'issue'),
    commented: toCount(commented, 'commented'),
  }
  return { asOf: now.toISOString().slice(0, 10), counts, ledger: buildLedger(found), commitsByYear }
}

export function loadGithubData(paths: { livePath?: string; snapshotPath?: string } = {}): GithubData {
  const livePath = paths.livePath ?? LIVE_PATH
  const snapshotPath = paths.snapshotPath ?? SNAPSHOT_PATH
  if (existsSync(livePath)) {
    try {
      return JSON.parse(readFileSync(livePath, 'utf8')) as GithubData
    } catch (error) {
      console.warn(`${livePath} is unreadable; using the snapshot. ${(error as Error).message}`)
    }
  }
  return JSON.parse(readFileSync(snapshotPath, 'utf8')) as GithubData
}

export type WriteIo = { writeFileSync: (path: string, text: string) => void; renameSync: (from: string, to: string) => void }

// Written beside the target and renamed over it, so a crash mid-write never leaves a truncated file.
// A write that fails removes its temporary file and rethrows; the target is never touched.
export function writeAtomically(path: string, text: string, io: WriteIo = { writeFileSync, renameSync }): void {
  const temp = `${path}.${process.pid}.tmp`
  try {
    io.writeFileSync(temp, text)
    io.renameSync(temp, path)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

export async function runCli(options: { fetchImpl: typeof fetch; token: string | undefined; outPath: string }): Promise<number> {
  if (!options.token) {
    console.warn('No GH_TOKEN or GITHUB_TOKEN set; keeping the existing GitHub data.')
    return 0
  }
  try {
    const data = await fetchGithubData(options.fetchImpl, options.token)
    mkdirSync(dirname(options.outPath), { recursive: true })
    writeAtomically(options.outPath, `${JSON.stringify(data, null, 2)}\n`)
    console.log(`Wrote ${options.outPath} (${data.asOf})`)
  } catch (error) {
    console.warn(`GitHub data not refreshed; keeping the existing file. ${(error as Error).message}`)
  }
  return 0
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  process.exitCode = await runCli({ fetchImpl: fetch, token, outPath: LIVE_PATH })
}
