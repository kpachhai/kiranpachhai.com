import { UPSTREAM_MAP, type UpstreamLink } from '../data/upstream-map'
import type { DomainId, Upstream } from '../model/schema'

// One upstream repo as every list on the site shows it: the Upstream ledger, the proof drawer and
// the no-JS hero list all read these rows, so they agree on repos, labels and statuses.
export type UpstreamRow = {
  label: string
  href: string
  domainId: DomainId
  statuses: Upstream['status'][]
  links: UpstreamLink[]
}

const REPO_ROOT = 'https://github.com/'

// One row per repo in the generated ledger, in ledger order. The label and the statuses come from
// the ledger (itself built from UPSTREAM_MAP and the refreshed GitHub data); the pinned links come
// from the same map entry. A repo the ledger does not list gets no row anywhere.
export function upstreamRows(ledger: Upstream[]): UpstreamRow[] {
  const rows: UpstreamRow[] = []
  for (const entry of ledger) {
    const existing = rows.find((row) => row.href === entry.href)
    if (existing) {
      existing.statuses.push(entry.status)
      continue
    }
    const repo = entry.href.startsWith(REPO_ROOT) ? entry.href.slice(REPO_ROOT.length) : entry.href
    rows.push({ label: entry.label, href: entry.href, domainId: entry.domainId, statuses: [entry.status], links: UPSTREAM_MAP[repo]?.links ?? [] })
  }
  return rows
}
