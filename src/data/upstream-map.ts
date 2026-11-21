import type { DOMAIN_IDS } from '../model/schema'

type DomainId = (typeof DOMAIN_IDS)[number]

// A pinned contribution inside a mapped repo: a real link target and a short neutral note. It
// carries no status; statuses come only from the refreshed GitHub data, per repo.
export type UpstreamLink = { href: string; note: string }

// Hand-curated: public repo full name -> neutral ledger label and domain, plus the contributions
// worth linking directly. This one table feeds the Upstream ledger, the sheet's readout and the
// no-JS hero list. Repos missing here still count in the totals but are never listed. A label
// names the repo, not a status: one label serves every status row the repo gets, and the chip
// carries the status.
type MapEntry = { domainId: DomainId; label: string; links?: UpstreamLink[] }

const GH = 'https://github.com'

export const UPSTREAM_MAP: Record<string, MapEntry> = {
  'hiero-ledger/hiero-json-rpc-relay': {
    domainId: 'protocol',
    label: 'JSON-RPC relay debug APIs',
    links: [{ href: `${GH}/hiero-ledger/hiero-json-rpc-relay/pull/4764`, note: 'tinybars to weibars in debug traces' }],
  },
  'hashgraph/hedera-docs': {
    domainId: 'explainers',
    label: 'Developer documentation tutorials',
    links: [
      { href: `${GH}/hashgraph/hedera-docs/pull/375`, note: 'forking tutorials' },
      { href: `${GH}/hashgraph/hedera-docs/pull/492`, note: 'Foundry HTS fork testing tutorial, part 2' },
      { href: `${GH}/hashgraph/hedera-docs/pull/333`, note: 'Schedule Service tutorials' },
    ],
  },
  'hedera-dev/hedera-code-snippets': {
    domainId: 'explainers',
    label: 'Developer code snippets',
    links: [
      { href: `${GH}/hedera-dev/hedera-code-snippets/pull/48`, note: 'Schedule Service tutorials' },
      { href: `${GH}/hedera-dev/hedera-code-snippets/pull/47`, note: 'fork Hedera mainnet locally' },
    ],
  },
  'hedera-dev/hedera-skills': {
    domainId: 'agents',
    label: 'Developer skills plugins',
    links: [{ href: `${GH}/hedera-dev/hedera-skills/pull/2`, note: 'dev-intelligence plugin' }],
  },
  'hashgraph/hedera-metamask-snaps': {
    domainId: 'wallets',
    label: 'Hedera wallet snap',
    links: [
      { href: `${GH}/hashgraph/hedera-metamask-snaps/pull/309`, note: 'audit fixes (2024)' },
      { href: `${GH}/hashgraph/hedera-metamask-snaps/pull/903`, note: 'audit fix (2025)' },
    ],
  },
  'tuum-tech/identify': {
    domainId: 'wallets',
    label: 'Identity wallet snap',
    links: [
      { href: `${GH}/tuum-tech/identify/pull/2`, note: 'Hedera SDK integration' },
      { href: `${GH}/tuum-tech/identify/pull/18`, note: 'EVM network support' },
      { href: `${GH}/tuum-tech/identify/pull/73`, note: 'audit fixes' },
    ],
  },
  'mgarbs/hedera-ccip-demos': { domainId: 'chains', label: 'Cross-chain messaging demos' },
  'danielmarv/clpr-website': {
    domainId: 'explainers',
    label: 'Cross-ledger explainer site',
    links: [
      { href: `${GH}/danielmarv/clpr-website/pull/7`, note: 'plumbing explainer built from source' },
      { href: `${GH}/danielmarv/clpr-website/pull/10`, note: 'claims checked against the spec' },
      { href: `${GH}/danielmarv/clpr-website/pull/19`, note: 'LFDT website requirements' },
    ],
  },
  'LFDT-CLPR/clpr-website': {
    domainId: 'explainers',
    label: 'Cross-ledger project site',
    links: [{ href: `${GH}/LFDT-CLPR/clpr-website/pull/7`, note: 'sync to the latest contracts, endpoint and governance' }],
  },
  'ava-labs/hypersdk': {
    domainId: 'protocol',
    label: 'HyperSDK',
    links: [{ href: `${GH}/ava-labs/hypersdk/discussions`, note: 'design discussions' }],
  },
  'MetaMask/snaps': { domainId: 'wallets', label: 'Snaps platform' },
  'elastos/Elastos.Developer.Website': { domainId: 'explainers', label: 'Developer documentation pages' },
  'Nuklai/nuklai-js-sdk': { domainId: 'chains', label: 'An L1 SDK (2024)' },
  'Nuklai/nuklai-wallet': { domainId: 'chains', label: 'An L1 wallet (2024)' },
  'oliver006/redis_exporter': {
    domainId: 'chains',
    label: 'redis_exporter',
    links: [{ href: `${GH}/oliver006/redis_exporter/pull/87`, note: 'latency stats (2017)' }],
  },
}
