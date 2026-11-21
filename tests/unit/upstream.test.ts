import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadGithubData } from '../../scripts/data/fetch-github'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'
import { buildIslandData } from '../../src/island/data'
import { sourceLabel } from '../../src/lib/provenance'
import { upstreamRows } from '../../src/lib/upstream'
import { model } from '../../src/model'
import type { Upstream } from '../../src/model/schema'

const file = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const SNAPSHOT = file('../../src/data/github.snapshot.json')
const LIVE = file('../../src/data/github.json')
const STATUS_WORDS = /['"](?:merged|open|review|discussion|commits)['"]/

const ledgers: [string, Upstream[]][] = [
  ['snapshot', loadGithubData({ livePath: '/nonexistent', snapshotPath: SNAPSHOT }).ledger],
  ...(existsSync(LIVE) ? [['live', loadGithubData({ livePath: LIVE }).ledger] as [string, Upstream[]]] : []),
]

const readoutFor = (ledger: Upstream[]) => buildIslandData(model, (source) => sourceLabel(source), upstreamRows(ledger)).domains

// Every contribution the drawer listed before the lists were joined; each keeps its link target.
const KEPT_HREFS = [
  'https://github.com/hiero-ledger/hiero-json-rpc-relay/pull/4764',
  'https://github.com/ava-labs/hypersdk/discussions',
  'https://github.com/hashgraph/hedera-metamask-snaps',
  'https://github.com/hashgraph/hedera-metamask-snaps/pull/309',
  'https://github.com/hashgraph/hedera-metamask-snaps/pull/903',
  'https://github.com/tuum-tech/identify/pull/2',
  'https://github.com/tuum-tech/identify/pull/18',
  'https://github.com/tuum-tech/identify/pull/73',
  'https://github.com/hedera-dev/hedera-skills/pull/2',
  'https://github.com/hashgraph/hedera-docs/pull/375',
  'https://github.com/hashgraph/hedera-docs/pull/492',
  'https://github.com/hashgraph/hedera-docs/pull/333',
  'https://github.com/hedera-dev/hedera-code-snippets/pull/48',
  'https://github.com/hedera-dev/hedera-code-snippets/pull/47',
  'https://github.com/danielmarv/clpr-website/pull/7',
  'https://github.com/danielmarv/clpr-website/pull/10',
  'https://github.com/danielmarv/clpr-website/pull/19',
  'https://github.com/LFDT-CLPR/clpr-website/pull/7',
  'https://github.com/Nuklai/nuklai-js-sdk',
  'https://github.com/Nuklai/nuklai-wallet',
  'https://github.com/oliver006/redis_exporter/pull/87',
]

describe('one upstream list', () => {
  for (const [name, ledger] of ledgers) {
    it(`the readout names only repos, labels and statuses the ${name} ledger has, per area`, () => {
      for (const domain of readoutFor(ledger)) {
        const entries = ledger.filter((entry) => entry.domainId === domain.id)
        const ledgerHrefs = [...new Set(entries.map((entry) => entry.href))]
        expect(domain.upstream.map((item) => item.href), domain.id).toEqual(ledgerHrefs)
        for (const item of domain.upstream) {
          const forRepo = entries.filter((entry) => entry.href === item.href)
          expect(forRepo.map((entry) => entry.label), item.href).toContain(item.label)
          expect(item.statuses.map((status) => status.status), item.href).toEqual(forRepo.map((entry) => entry.status))
        }
      }
    })

    it(`keeps every contribution the readout lists, with its real link target (${name})`, () => {
      const shown = readoutFor(ledger).flatMap((domain) => domain.upstream.flatMap((item) => [item.href, ...item.links.map((link) => link.href)]))
      expect(KEPT_HREFS.filter((href) => !shown.includes(href))).toEqual([])
    })
  }

  it('carries no status literal outside the generated data', () => {
    for (const source of ['../../src/model/data/domains.ts', '../../src/data/upstream-map.ts']) {
      const text = readFileSync(file(source), 'utf8')
      expect(text.match(/\bstatus\s*:\s*['"`]/)?.[0], source).toBeUndefined()
      expect(text.match(STATUS_WORDS)?.[0], source).toBeUndefined()
    }
    for (const domain of model.domains) expect(Object.keys(domain), domain.id).not.toContain('upstream')
    for (const [repo, entry] of Object.entries(UPSTREAM_MAP)) {
      expect(Object.keys(entry), repo).not.toContain('status')
      for (const link of entry.links ?? []) expect(Object.keys(link).sort(), repo).toEqual(['href', 'note'])
    }
  })

  it('takes a status from the refreshed data, so a merge shows as merged everywhere', () => {
    const site = 'https://github.com/LFDT-CLPR/clpr-website'
    const ledger: Upstream[] = [{ label: UPSTREAM_MAP['LFDT-CLPR/clpr-website']!.label, href: site, status: 'merged', domainId: 'explainers' }]
    const explainers = readoutFor(ledger).find((domain) => domain.id === 'explainers')!
    expect(explainers.upstream).toHaveLength(1)
    expect(explainers.upstream[0]!.statuses).toEqual([{ status: 'merged', label: 'Merged' }])
    expect(explainers.upstream[0]!.links.map((link) => link.href)).toEqual([`${site}/pull/7`])
  })

  it('files every pinned link inside the repo it is listed under', () => {
    for (const [repo, entry] of Object.entries(UPSTREAM_MAP)) {
      for (const link of entry.links ?? []) expect(link.href.startsWith(`https://github.com/${repo}/`), link.href).toBe(true)
    }
  })
})
