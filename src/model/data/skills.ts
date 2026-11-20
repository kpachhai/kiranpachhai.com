import type { Skill } from '../schema'
import { LINKEDIN, OLD_PORTFOLIO, OWNER, url } from './sources'

const GH = 'https://github.com'
const SITE_PACKAGE = url(`${GH}/kpachhai/kiranpachhai.com/blob/main/package.json`)

// The toolkit: skills still in use, each with the earliest year a source shows it (the start year
// of the role that shows it, or the year of the repository). Shown as "since <year>"; no ratings.
// Each skill is added to the journey by the role whose years contain its first year.
export const skills: Skill[] = [
  // Kinds of work
  { id: 'protocol-l1', name: 'Protocol and L1 design', set: 'work', firstYear: 2023, evidence: { roleIds: ['architect'], proofIds: ['l1-vm'] }, source: LINKEDIN },
  { id: 'smart-contracts', name: 'Smart contract engineering', set: 'work', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: LINKEDIN },
  {
    id: 'wallets-identity',
    name: 'Wallets and identity',
    set: 'work',
    firstYear: 2020,
    evidence: { roleIds: ['tech-lead'], proofIds: ['identify-snap', 'hedera-wallet-snap'] },
    source: LINKEDIN,
  },
  { id: 'backend-apis', name: 'Backend APIs and services', set: 'work', firstYear: 2018, evidence: { roleIds: ['devrel'], proofIds: ['storage-node'] }, source: LINKEDIN },
  {
    id: 'sre-observability',
    name: 'SRE and observability',
    set: 'work',
    firstYear: 2016,
    evidence: { roleIds: ['sre'], proofIds: ['rsyslog-exporter'] },
    source: LINKEDIN,
  },
  { id: 'data-systems', name: 'Data systems', set: 'work', firstYear: 2012, evidence: { roleIds: ['student'] }, source: LINKEDIN },
  { id: 'solutions-architecture', name: 'Solutions architecture', set: 'work', firstYear: 2025, evidence: { roleIds: ['developer-advocate'] }, source: LINKEDIN },
  { id: 'product-ownership', name: 'Product ownership', set: 'work', firstYear: 2020, evidence: { roleIds: ['tech-lead'] }, source: LINKEDIN },
  {
    id: 'developer-education',
    name: 'Developer education',
    set: 'work',
    firstYear: 2018,
    evidence: { roleIds: ['devrel', 'course-instructor', 'developer-advocate'], proofIds: ['web3-101-course', 'hedera-docs-tutorials'] },
    source: LINKEDIN,
  },
  { id: 'testing', name: 'Unit and integration testing', set: 'work', firstYear: 2014, evidence: { roleIds: ['software-engineer'] }, source: LINKEDIN },
  { id: 'ci-cd', name: 'CI/CD', set: 'work', firstYear: 2020, evidence: { roleIds: ['tech-lead'] }, source: LINKEDIN },

  // Languages
  { id: 'solidity', name: 'Solidity', set: 'language', firstYear: 2018, evidence: { roleIds: ['devrel'], proofIds: ['hts721-suite'] }, source: LINKEDIN },
  { id: 'typescript', name: 'TypeScript', set: 'language', firstYear: 2020, evidence: { roleIds: ['tech-lead'], proofIds: ['signscope-snap'] }, source: LINKEDIN },
  { id: 'javascript', name: 'JavaScript', set: 'language', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: OLD_PORTFOLIO },
  { id: 'go', name: 'Go', set: 'language', firstYear: 2016, evidence: { roleIds: ['sre'], proofIds: ['rsyslog-exporter'] }, source: LINKEDIN },
  { id: 'python', name: 'Python', set: 'language', firstYear: 2014, evidence: { roleIds: ['software-engineer', 'devrel'], proofIds: ['storage-node'] }, source: LINKEDIN },
  { id: 'java', name: 'Java', set: 'language', firstYear: 2012, evidence: { roleIds: ['student'] }, source: LINKEDIN },
  // Daily shell scripts in the 2014-2016 role.
  { id: 'bash', name: 'Bash', set: 'language', firstYear: 2014, evidence: { roleIds: ['software-engineer'], proofIds: ['tx-analysis'] }, source: LINKEDIN },
  { id: 'sql', name: 'SQL', set: 'language', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: OLD_PORTFOLIO },

  // Frameworks and stacks
  { id: 'react', name: 'React', set: 'stack', firstYear: 2020, evidence: { roleIds: ['tech-lead', 'course-instructor'] }, source: LINKEDIN },
  { id: 'nodejs', name: 'Node.js', set: 'stack', firstYear: 2020, evidence: { roleIds: ['tech-lead'] }, source: LINKEDIN },
  { id: 'django', name: 'Django', set: 'stack', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: OLD_PORTFOLIO },
  {
    id: 'hardhat',
    name: 'Hardhat',
    set: 'stack',
    firstYear: 2022,
    evidence: { roleIds: ['course-instructor'], proofIds: ['web3-101-course', 'erc-8004-registries'] },
    source: LINKEDIN,
  },
  {
    id: 'foundry',
    name: 'Foundry',
    set: 'stack',
    firstYear: 2025,
    evidence: { roleIds: ['developer-advocate'], proofIds: ['hts721-suite', 'erc-8004-registries'] },
    source: url(`${GH}/kpachhai/hts721-example`),
  },
  {
    id: 'viem',
    name: 'viem',
    set: 'stack',
    firstYear: 2025,
    evidence: { roleIds: ['developer-advocate'] },
    source: url(`${GH}/kpachhai/hedera-viem-example`),
  },
  { id: 'ethersjs', name: 'ethers.js', set: 'stack', firstYear: 2022, evidence: { roleIds: ['course-instructor'], proofIds: ['web3-101-course'] }, source: LINKEDIN },
  { id: 'openzeppelin', name: 'OpenZeppelin', set: 'stack', firstYear: 2022, evidence: { roleIds: ['course-instructor'], proofIds: ['web3-101-course'] }, source: LINKEDIN },
  { id: 'rainbowkit', name: 'RainbowKit', set: 'stack', firstYear: 2022, evidence: { roleIds: ['course-instructor'], proofIds: ['web3-101-course'] }, source: LINKEDIN },
  {
    id: 'avalanche-hypersdk',
    name: 'Avalanche HyperSDK',
    set: 'stack',
    firstYear: 2023,
    evidence: { roleIds: ['architect'], proofIds: ['l1-vm'] },
    source: LINKEDIN,
  },
  {
    id: 'hedera-sdks',
    name: 'Hedera SDKs',
    set: 'stack',
    firstYear: 2023,
    evidence: { roleIds: ['tech-lead', 'developer-advocate'], proofIds: ['identify-snap', 'signscope-snap', 'go-sdk-account-demo'] },
    source: url(`${GH}/tuum-tech/identify/pull/2`),
  },
  {
    id: 'metamask-snaps',
    name: 'MetaMask Snaps',
    set: 'stack',
    firstYear: 2022,
    evidence: { roleIds: ['tech-lead'], proofIds: ['identify-snap', 'hedera-wallet-snap', 'signscope-snap'] },
    source: LINKEDIN,
  },
  {
    id: 'dids-vcs',
    name: 'DIDs and verifiable credentials',
    set: 'stack',
    firstYear: 2020,
    evidence: { roleIds: ['tech-lead'], proofIds: ['identify-snap'] },
    source: LINKEDIN,
  },

  // Platforms and tools
  { id: 'mcp', name: 'MCP', set: 'tool', firstYear: 2025, evidence: { roleIds: ['developer-advocate'], proofIds: ['hip-explorer-agent'] }, source: OWNER },
  { id: 'docker', name: 'Docker', set: 'tool', firstYear: 2016, evidence: { roleIds: ['sre', 'devrel'], proofIds: ['tx-analysis'] }, source: LINKEDIN },
  { id: 'aws', name: 'AWS', set: 'tool', firstYear: 2020, evidence: { roleIds: ['tech-lead'] }, source: LINKEDIN },
  { id: 'gcp', name: 'GCP', set: 'tool', firstYear: 2020, evidence: { roleIds: ['tech-lead'] }, source: LINKEDIN },
  { id: 'prometheus', name: 'Prometheus', set: 'tool', firstYear: 2016, evidence: { roleIds: ['sre'], proofIds: ['rsyslog-exporter'] }, source: LINKEDIN },
  { id: 'grafana', name: 'Grafana', set: 'tool', firstYear: 2016, evidence: { roleIds: ['sre'], proofIds: ['rsyslog-exporter'] }, source: LINKEDIN },
  // The decentralized storage node stored its data objects on MongoDB (2020).
  { id: 'mongodb', name: 'MongoDB', set: 'tool', firstYear: 2020, evidence: { roleIds: ['devrel'], proofIds: ['storage-node', 'tx-analysis'] }, source: LINKEDIN },
  { id: 'postgresql', name: 'PostgreSQL', set: 'tool', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: OLD_PORTFOLIO },
  { id: 'mysql', name: 'MySQL', set: 'tool', firstYear: 2018, evidence: { roleIds: ['devrel'] }, source: OLD_PORTFOLIO },
  { id: 'unix', name: 'Unix and Linux administration', set: 'tool', firstYear: 2014, evidence: { roleIds: ['software-engineer', 'sre'] }, source: LINKEDIN },
  { id: 'ipfs', name: 'IPFS', set: 'tool', firstYear: 2018, evidence: { roleIds: ['devrel'], proofIds: ['storage-node'] }, source: LINKEDIN },
  // This site's own toolchain, public in its package.json.
  { id: 'astro', name: 'Astro', set: 'tool', firstYear: 2026, evidence: { roleIds: ['developer-advocate'] }, source: SITE_PACKAGE },
  { id: 'vitest', name: 'Vitest', set: 'tool', firstYear: 2026, evidence: { roleIds: ['developer-advocate'] }, source: SITE_PACKAGE },
  { id: 'playwright', name: 'Playwright', set: 'tool', firstYear: 2026, evidence: { roleIds: ['developer-advocate'] }, source: SITE_PACKAGE },
]
