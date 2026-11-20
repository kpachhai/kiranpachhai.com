import type { Material } from '../schema'
import { LINKEDIN, OWNER, url } from './sources'

const GH = 'https://github.com'

export const materials: Material[] = [
  // Languages, in the order of the bill of materials
  {
    id: 'solidity',
    band: 'language',
    name: 'Solidity',
    usedIn: ['hts721-suite', 'erc-8004-registries', 'schedule-service-demos'],
    source: LINKEDIN,
  },
  {
    id: 'typescript',
    band: 'language',
    name: 'TypeScript',
    usedIn: ['signscope-snap', 'hedera-wallet-snap', 'hip-explorer-agent', 'cross-ledger-explorer', 'agent-dispatcher'],
    source: LINKEDIN,
  },
  {
    id: 'go',
    band: 'language',
    name: 'Go',
    usedIn: ['l1-vm', 'rsyslog-exporter', 'go-sdk-account-demo'],
    source: LINKEDIN,
  },
  {
    id: 'python',
    band: 'language',
    name: 'Python',
    usedIn: ['plumbing-of-money', 'storage-node', 'digest-pipeline'],
    source: LINKEDIN,
  },

  // Tools and platforms, each evidenced by a proof
  { id: 'foundry', band: 'tool', name: 'Foundry', usedIn: ['hts721-suite', 'erc-8004-registries'], source: url(`${GH}/kpachhai/hts721-example`) },
  {
    id: 'hardhat',
    band: 'tool',
    name: 'Hardhat',
    usedIn: ['erc-8004-registries', 'web3-101-course'],
    source: url(`${GH}/kpachhai/erc-8004-contracts-hardhat3`),
  },
  {
    id: 'metamask-snaps',
    band: 'tool',
    name: 'MetaMask Snaps',
    usedIn: ['signscope-snap', 'hedera-wallet-snap', 'identify-snap'],
    source: url(`${GH}/kpachhai/signscope-snap`),
  },
  { id: 'mcp', band: 'tool', name: 'MCP', usedIn: ['hip-explorer-agent'], source: OWNER },
  { id: 'prometheus', band: 'tool', name: 'Prometheus', usedIn: ['rsyslog-exporter'], source: LINKEDIN },
  { id: 'grafana', band: 'tool', name: 'Grafana', usedIn: ['rsyslog-exporter'], source: LINKEDIN },
  { id: 'docker', band: 'tool', name: 'Docker', usedIn: ['tx-analysis'], source: url(`${GH}/kpachhai/hedera-tx-analysis`) },

  // Disciplines
  {
    id: 'wallet-key-handling',
    band: 'discipline',
    name: 'Wallet and key handling',
    usedIn: ['signscope-snap', 'hedera-wallet-snap', 'identify-snap'],
    source: LINKEDIN,
  },
  {
    id: 'agent-harnesses',
    band: 'discipline',
    name: 'Agent harnesses',
    usedIn: ['hip-explorer-agent', 'agent-dispatcher', 'digest-pipeline'],
    source: OWNER,
  },
  { id: 'observability', band: 'discipline', name: 'Observability', usedIn: ['rsyslog-exporter'], source: LINKEDIN },
  {
    id: 'course-explainer-design',
    band: 'discipline',
    name: 'Course and explainer design',
    usedIn: ['plumbing-of-money', 'finance-101-talk', 'web3-101-course', 'explainer-site-engine'],
    source: OWNER,
  },
  {
    id: 'data-analysis',
    band: 'discipline',
    name: 'Data analysis',
    usedIn: ['hedera-tx-counts', 'tx-analysis', 'incoming-transfer-monitor'],
    source: url(`${GH}/kpachhai/hgraph-queries`),
  },
]
