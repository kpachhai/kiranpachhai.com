import type { Material, Source } from '../schema'
import { skills } from './skills'
import { LINKEDIN, OWNER, url } from './sources'

const GH = 'https://github.com'

// A part that is also a toolkit skill carries the skill's source, so the two never disagree.
function toolkitSource(id: string): Source {
  const skill = skills.find((entry) => entry.id === id)
  if (!skill) throw new Error(`materials: no toolkit skill ${id}`)
  return skill.source
}

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

  // Frameworks and stacks, then platforms and tools, grouped and sourced as in the toolkit
  { id: 'foundry', band: 'stack', name: 'Foundry', usedIn: ['hts721-suite', 'erc-8004-registries'], source: toolkitSource('foundry') },
  { id: 'hardhat', band: 'stack', name: 'Hardhat', usedIn: ['erc-8004-registries', 'web3-101-course'], source: toolkitSource('hardhat') },
  {
    id: 'metamask-snaps',
    band: 'stack',
    name: 'MetaMask Snaps',
    usedIn: ['signscope-snap', 'hedera-wallet-snap', 'identify-snap'],
    source: toolkitSource('metamask-snaps'),
  },
  { id: 'mcp', band: 'tool', name: 'MCP', usedIn: ['hip-explorer-agent'], source: toolkitSource('mcp') },
  { id: 'prometheus', band: 'tool', name: 'Prometheus', usedIn: ['rsyslog-exporter'], source: toolkitSource('prometheus') },
  { id: 'grafana', band: 'tool', name: 'Grafana', usedIn: ['rsyslog-exporter'], source: toolkitSource('grafana') },
  { id: 'docker', band: 'tool', name: 'Docker', usedIn: ['tx-analysis'], source: toolkitSource('docker') },

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
