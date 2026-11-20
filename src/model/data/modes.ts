import type { ModeId, RangeCell } from '../schema'

export const modes: { id: ModeId; name: string }[] = [
  { id: 'build', name: 'Build' },
  { id: 'architect', name: 'Architect' },
  { id: 'research', name: 'Research' },
  { id: 'teach', name: 'Teach' },
  { id: 'operate', name: 'Operate' },
]

// Only cells a proof backs are listed; an absent cell renders empty.
export const range: RangeCell[] = [
  { domainId: 'protocol', mode: 'build', proofIds: ['schedule-service-demos', 'erc-8004-registries', 'hts721-suite', 'go-sdk-account-demo'] },

  { domainId: 'wallets', mode: 'build', proofIds: ['signscope-snap', 'hedera-wallet-snap', 'identify-snap', 'cross-ledger-explorer'] },
  { domainId: 'wallets', mode: 'architect', proofIds: ['cross-ledger-explorer'] },

  { domainId: 'agents', mode: 'build', proofIds: ['hip-explorer-agent', 'agent-dispatcher', 'digest-pipeline'] },
  { domainId: 'agents', mode: 'architect', proofIds: ['agent-dispatcher'] },
  { domainId: 'agents', mode: 'operate', proofIds: ['agent-dispatcher'] },

  { domainId: 'explainers', mode: 'build', proofIds: ['plumbing-of-money', 'explainer-site-engine', 'onchain-finance-template'] },
  { domainId: 'explainers', mode: 'architect', proofIds: ['onchain-finance-template'] },
  {
    domainId: 'explainers',
    mode: 'teach',
    proofIds: ['hedera-docs-tutorials', 'schedule-service-tutorials', 'web3-101-course', 'plumbing-of-money', 'finance-101-talk'],
  },
  { domainId: 'explainers', mode: 'operate', proofIds: ['explainer-site-engine'] },

  { domainId: 'data', mode: 'build', proofIds: ['tx-analysis', 'incoming-transfer-monitor'] },
  { domainId: 'data', mode: 'research', proofIds: ['hedera-tx-counts', 'tx-analysis'] },

  { domainId: 'chains', mode: 'build', proofIds: ['l1-vm', 'storage-node', 'rsyslog-exporter'] },
  { domainId: 'chains', mode: 'architect', proofIds: ['l1-vm'] },
  { domainId: 'chains', mode: 'operate', proofIds: ['rsyslog-exporter'] },
]
