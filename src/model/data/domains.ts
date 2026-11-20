import type { Domain, Proof } from '../schema'
import { LINKEDIN, LINKEDIN_PROFILE, OWNER, url } from './sources'

const GH = 'https://github.com'

function linked(proof: Omit<Proof, 'source' | 'private'> & { href: string }): Proof {
  return { ...proof, source: url(proof.href), private: false }
}

function privateProof(proof: Omit<Proof, 'source' | 'private' | 'href'>): Proof {
  return { ...proof, source: OWNER, private: true }
}

function career(proof: Omit<Proof, 'source' | 'private'>): Proof {
  return { ...proof, source: LINKEDIN, private: false }
}

export const proofs: Proof[] = [
  // Protocol and standards
  linked({
    id: 'schedule-service-demos',
    label: 'Schedule Service demos',
    detail: 'A recurring on-chain alarm clock and a capacity-aware rebalancer on the Schedule Service system contract',
    href: `${GH}/kpachhai/hip-1215-simple-contracts-demo`,
    domainId: 'protocol',
    methods: [],
  }),
  linked({
    id: 'erc-8004-registries',
    label: 'ERC-8004 registries on Hedera',
    detail: 'Upgradeable identity, reputation and validation registries deployed to Hedera testnet, in Foundry and Hardhat 3',
    href: `${GH}/kpachhai/erc-8004-contracts-foundry`,
    domainId: 'protocol',
    methods: [],
  }),
  linked({
    id: 'hts721-suite',
    label: 'HTS721 example suite',
    detail: 'Modular low-bytecode contracts for creating and managing HTS NFTs from the EVM, with Foundry tests',
    href: `${GH}/kpachhai/hts721-example`,
    domainId: 'protocol',
    methods: [],
  }),
  linked({
    id: 'go-sdk-account-demo',
    label: 'Go SDK account demo',
    detail: 'Creates a Hedera account with the Go SDK',
    href: `${GH}/kpachhai/create_account_demo_go_sdk`,
    domainId: 'protocol',
    methods: [],
  }),

  // Wallets and developer tooling
  linked({
    id: 'signscope-snap',
    label: 'SignScope Snap',
    detail: 'MetaMask Snap with insight into Hedera transactions',
    href: `${GH}/kpachhai/signscope-snap`,
    domainId: 'wallets',
    methods: [],
  }),
  career({
    id: 'hedera-wallet-snap',
    label: 'Hedera Wallet Snap',
    detail: 'A MetaMask Snap for Hedera',
    href: LINKEDIN_PROFILE,
    domainId: 'wallets',
    methods: [],
  }),
  career({
    id: 'identify-snap',
    label: 'Identify Snap',
    detail: 'A MetaMask Snap for decentralized identifiers and verifiable credentials',
    href: `${GH}/tuum-tech/identify`,
    domainId: 'wallets',
    methods: [],
  }),
  privateProof({
    id: 'cross-ledger-explorer',
    label: 'Cross-ledger explorer',
    detail:
      'Explorer for cross-ledger channels and message journeys; ledger plugins (EVM JSON-RPC, Hiero mirror node) behind a conformance suite; replay with evidence at every step',
    domainId: 'wallets',
    methods: ['D'],
  }),

  // AI agents and harnesses
  privateProof({
    id: 'hip-explorer-agent',
    label: 'HIP explorer agent',
    detail:
      'Agent indexing Hedera and Hiero Improvement Proposals and mapping each to implementing PRs across Hiero repos; chat or read-only MCP server; approval-gated owner actions; guardrail config anchored on HCS; eval harness',
    domainId: 'agents',
    methods: ['A'],
  }),
  privateProof({
    id: 'agent-dispatcher',
    label: 'Sandboxed agent dispatcher',
    detail:
      'Local dispatcher running coding agents inside an OS sandbox; a local model routes work; cost receipt per run; plugins accepted via conformance suite',
    domainId: 'agents',
    methods: ['A', 'B', 'D'],
  }),
  privateProof({
    id: 'digest-pipeline',
    label: 'Digest pipeline',
    detail: 'Daily, weekly and monthly digests: deterministic helpers gather, an LLM only synthesizes, coverage gate before each rollup',
    domainId: 'agents',
    methods: [],
  }),

  // Explainers and education
  privateProof({
    id: 'plumbing-of-money',
    label: 'The Plumbing of Money',
    detail: 'Course on how money moves and how it is being rebuilt: interactive widgets, Python exercises, post-build gates',
    domainId: 'explainers',
    methods: ['A', 'B', 'E'],
  }),
  privateProof({
    id: 'finance-101-talk',
    label: 'Finance 101 talk',
    detail: 'Talk built as slides generated from JSON through intent, spec, plan and critique, with a deterministic build',
    domainId: 'explainers',
    methods: ['A', 'E'],
  }),
  career({
    id: 'web3-101-course',
    label: 'Web3 101 course',
    detail: 'Online course curriculum and video content with Solidity, Hardhat, ethers.js, RainbowKit and OpenZeppelin',
    href: `${GH}/EatTheBlocks/web3-101`,
    domainId: 'explainers',
    methods: ['E'],
  }),
  linked({
    id: 'hedera-docs-tutorials',
    label: 'Hedera docs tutorials',
    detail: 'Fork testing tutorials, parts 1 and 2, and schedule service tutorials',
    href: `${GH}/hashgraph/hedera-docs/pull/375`,
    domainId: 'explainers',
    methods: [],
  }),
  linked({
    id: 'schedule-service-tutorials',
    label: 'Schedule Service tutorials',
    detail: 'Two-part Hedera docs series: scheduling smart contract calls, then dynamic rebalancing through scheduled execution',
    href: `${GH}/hashgraph/hedera-docs/pull/333`,
    domainId: 'explainers',
    methods: [],
  }),
  privateProof({
    id: 'explainer-site-engine',
    label: 'Gated explainer site engine',
    detail:
      'Engine for pinned, gated explainer sites: one page for everyone, one for developers; every code reference pinned to an upstream commit; gates check provenance, names, simulations',
    domainId: 'explainers',
    methods: ['B', 'C', 'E'],
  }),
  privateProof({
    id: 'onchain-finance-template',
    label: 'White-label on-chain finance template',
    detail:
      'White-label template for on-chain finance apps; all data simulated by a seeded engine; every integration behind a swappable adapter',
    domainId: 'explainers',
    methods: ['D'],
  }),

  // Data and analysis
  linked({
    id: 'hedera-tx-counts',
    label: 'Hedera token and contract transaction counts',
    detail: 'GraphQL queries and yearly results for HTS and smart contract service transaction counts',
    href: `${GH}/kpachhai/hgraph-queries`,
    domainId: 'data',
    methods: [],
  }),
  linked({
    id: 'tx-analysis',
    label: 'Transaction analysis tooling',
    detail: 'Imports exported Hedera transactions into MongoDB and analyses transaction types against signature counts and token-creation key usage',
    href: `${GH}/kpachhai/hedera-tx-analysis`,
    domainId: 'data',
    methods: [],
  }),
  linked({
    id: 'incoming-transfer-monitor',
    label: 'Incoming-transfer monitor for EVM addresses',
    detail: 'Two ways to detect incoming HBAR to watched EVM addresses: REST polling of the mirror node versus a direct mirror DB query',
    href: `${GH}/kpachhai/hedera-monitor-incoming-transfers-evm-addrs`,
    domainId: 'data',
    methods: [],
  }),

  // Chains and infrastructure (career)
  career({
    id: 'l1-vm',
    label: 'An L1 VM on Avalanche HyperSDK',
    detail: 'Validator node architecture, parallelized execution, APIs, staking and validator rewards',
    href: LINKEDIN_PROFILE,
    domainId: 'chains',
    methods: [],
  }),
  career({
    id: 'storage-node',
    label: 'A decentralized storage node with a scripting mechanism',
    detail: 'Decentralized storage in Python with IPFS backup',
    href: LINKEDIN_PROFILE,
    domainId: 'chains',
    methods: [],
  }),
  career({
    id: 'rsyslog-exporter',
    label: 'Rsyslog Exporter for Prometheus in Go',
    detail: 'Syslog metrics for Prometheus; introduced Go, Prometheus and Grafana to the team',
    href: LINKEDIN_PROFILE,
    domainId: 'chains',
    methods: [],
  }),
]

export const domains: Domain[] = [
  {
    id: 'protocol',
    name: 'Protocol and standards',
    source: OWNER,
    upstream: [
      {
        label: 'JSON-RPC relay: tinybars to weibars in debug traces',
        href: `${GH}/hiero-ledger/hiero-json-rpc-relay/pull/4764`,
        status: 'merged',
        domainId: 'protocol',
      },
      { label: 'HyperSDK design discussions', href: `${GH}/ava-labs/hypersdk`, status: 'discussion', domainId: 'protocol' },
    ],
  },
  {
    id: 'wallets',
    name: 'Wallets and developer tooling',
    source: OWNER,
    upstream: [
      { label: 'A Snaps wallet repo: reviews', href: `${GH}/hashgraph/hedera-metamask-snaps`, status: 'review', domainId: 'wallets' },
      { label: 'A Snaps wallet repo: audit fixes (2024)', href: `${GH}/hashgraph/hedera-metamask-snaps/pull/309`, status: 'merged', domainId: 'wallets' },
      { label: 'A Snaps wallet repo: audit fix (2025)', href: `${GH}/hashgraph/hedera-metamask-snaps/pull/903`, status: 'merged', domainId: 'wallets' },
      { label: 'Identify Snap repo: Hedera SDK integration', href: `${GH}/tuum-tech/identify/pull/2`, status: 'merged', domainId: 'wallets' },
      { label: 'Identify Snap repo: EVM network support', href: `${GH}/tuum-tech/identify/pull/18`, status: 'merged', domainId: 'wallets' },
      { label: 'Identify Snap repo: audit fixes', href: `${GH}/tuum-tech/identify/pull/73`, status: 'merged', domainId: 'wallets' },
    ],
  },
  {
    id: 'agents',
    name: 'AI agents and harnesses',
    source: OWNER,
    upstream: [
      { label: 'Hedera skills: dev-intelligence plugin', href: `${GH}/hedera-dev/hedera-skills/pull/2`, status: 'merged', domainId: 'agents' },
    ],
  },
  {
    id: 'explainers',
    name: 'Explainers and education',
    source: OWNER,
    upstream: [
      { label: 'Hedera docs: forking tutorials', href: `${GH}/hashgraph/hedera-docs/pull/375`, status: 'merged', domainId: 'explainers' },
      {
        label: 'Hedera docs: Foundry HTS fork testing tutorial, part 2',
        href: `${GH}/hashgraph/hedera-docs/pull/492`,
        status: 'merged',
        domainId: 'explainers',
      },
      { label: 'Hedera docs: Schedule Service tutorials', href: `${GH}/hashgraph/hedera-docs/pull/333`, status: 'merged', domainId: 'explainers' },
      {
        label: 'Hedera code snippets: Schedule Service tutorials',
        href: `${GH}/hedera-dev/hedera-code-snippets/pull/48`,
        status: 'merged',
        domainId: 'explainers',
      },
      {
        label: 'Hedera code snippets: fork Hedera mainnet locally',
        href: `${GH}/hedera-dev/hedera-code-snippets/pull/47`,
        status: 'merged',
        domainId: 'explainers',
      },
      { label: 'CLPR website: plumbing explainer built from source', href: `${GH}/danielmarv/clpr-website/pull/7`, status: 'merged', domainId: 'explainers' },
      { label: 'CLPR website: claims checked against the spec', href: `${GH}/danielmarv/clpr-website/pull/10`, status: 'merged', domainId: 'explainers' },
      { label: 'CLPR website: LFDT website requirements', href: `${GH}/danielmarv/clpr-website/pull/19`, status: 'merged', domainId: 'explainers' },
      {
        label: 'CLPR website: sync to the latest contracts, endpoint and governance',
        href: `${GH}/LFDT-CLPR/clpr-website/pull/7`,
        status: 'open',
        domainId: 'explainers',
      },
    ],
  },
  {
    id: 'data',
    name: 'Data and analysis',
    source: OWNER,
    upstream: [],
  },
  {
    id: 'chains',
    name: 'Chains and infrastructure',
    source: OWNER,
    upstream: [
      { label: 'An L1 SDK (2024)', href: `${GH}/Nuklai/nuklai-js-sdk`, status: 'commits', domainId: 'chains' },
      { label: 'An L1 wallet (2024)', href: `${GH}/Nuklai/nuklai-wallet`, status: 'commits', domainId: 'chains' },
      { label: 'redis_exporter latency stats (2017)', href: `${GH}/oliver006/redis_exporter/pull/87`, status: 'merged', domainId: 'chains' },
    ],
  },
]
