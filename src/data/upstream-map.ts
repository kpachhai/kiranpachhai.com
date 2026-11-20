import type { DOMAIN_IDS } from '../model/schema'

type DomainId = (typeof DOMAIN_IDS)[number]

// Hand-curated: public repo full name -> neutral ledger label and domain.
// Repos missing here still count in the totals but are never listed.
type MapEntry = { domainId: DomainId; label: string }

export const UPSTREAM_MAP: Record<string, MapEntry> = {
  'hiero-ledger/hiero-json-rpc-relay': { domainId: 'protocol', label: 'JSON-RPC relay debug APIs' },
  'hashgraph/hedera-docs': { domainId: 'explainers', label: 'Developer documentation tutorials' },
  'hedera-dev/hedera-code-snippets': { domainId: 'explainers', label: 'Developer code snippets' },
  'hedera-dev/hedera-skills': { domainId: 'agents', label: 'Developer skills plugins' },
  'hashgraph/hedera-metamask-snaps': { domainId: 'wallets', label: 'Wallet snap reviews and fixes' },
  'tuum-tech/identify': { domainId: 'wallets', label: 'Identity wallet snap' },
  'mgarbs/hedera-ccip-demos': { domainId: 'chains', label: 'Cross-chain messaging demos' },
  'danielmarv/clpr-website': { domainId: 'explainers', label: 'Cross-ledger explainer site' },
  'LFDT-CLPR/clpr-website': { domainId: 'explainers', label: 'Cross-ledger project site' },
  'ava-labs/hypersdk': { domainId: 'protocol', label: 'HyperVM SDK discussions' },
  'MetaMask/snaps': { domainId: 'wallets', label: 'Snaps platform discussions' },
  'elastos/Elastos.Developer.Website': { domainId: 'explainers', label: 'Developer documentation pages' },
}
