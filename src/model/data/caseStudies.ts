import type { CaseStudy } from '../schema'
import { OWNER, url } from './sources'

// Public projects cite their PR or source files; private-derived ones follow the disclosure table (OWNER).
const DOCS_PR = url('https://github.com/hashgraph/hedera-docs/pull/333')
const DOCS_AT_MERGE = 'https://github.com/hashgraph/hedera-docs/blob/da7d0fdf921aca9cfb2545a956e37539706edad8/hedera/tutorials/smart-contracts'
const HSS_PART_1 = url(`${DOCS_AT_MERGE}/hss-x-evm-part-1-schedule-smart-contract-calls.mdx`)
const HSS_PART_2 = url(`${DOCS_AT_MERGE}/hss-x-evm-part-2-dynamic-rebalancing.mdx`)
const SNAP = 'https://github.com/kpachhai/signscope-snap/blob/main/packages/snap'
const SNAP_MANIFEST = url(`${SNAP}/snap.manifest.json`)
const SNAP_HANDLER = url(`${SNAP}/src/index.tsx`)

export const caseStudies: CaseStudy[] = [
  {
    slug: 'schedule-service',
    title: 'Schedule Service tutorials and demos',
    proofIds: ['schedule-service-demos', 'schedule-service-tutorials'],
    source: DOCS_PR,
    problem: {
      text: 'On most EVM chains a smart contract cannot wake up on its own: every call starts from an account or an off-chain bot, so time-based automation needs outside infrastructure. On Hedera, the Schedule Service lets a contract schedule future calls that the network itself executes.',
      source: HSS_PART_1,
    },
    approach: {
      text: 'A two-part tutorial series in the Hedera docs, each part with complete code. Part 1 builds an alarm clock contract that sets one-shot and recurring alarms through the Schedule Service system contract at 0x16b. Part 2 builds a capacity-aware DeFi rebalancer that reschedules itself after each run.',
      source: DOCS_PR,
    },
    methods: {
      text: 'Before it schedules, the rebalancer asks hasScheduleCapacity whether a future second can take the call; when it cannot, it backs off exponentially with jitter seeded by the PRNG system contract. The rebalancer ships with Solidity unit tests and TypeScript integration tests that run against Hedera testnet.',
      source: HSS_PART_2,
    },
    outcome: {
      text: 'Both parts merged into the Hedera docs on 2025-12-29. The alarm clock code lives in the Hedera code snippets, and the rebalancer has its own repository.',
      source: DOCS_PR,
    },
  },
  {
    slug: 'signscope-snap',
    title: 'SignScope Snap',
    proofIds: ['signscope-snap'],
    source: url('https://github.com/kpachhai/signscope-snap'),
    problem: {
      text: 'SignScope sets out to give a deep insight into Hedera transactions in MetaMask, before they are signed.',
      source: SNAP_MANIFEST,
    },
    approach: {
      text: "A MetaMask Snap with a transaction-insight handler for Hedera mainnet, testnet and previewnet. It resolves sender and recipient to Hedera account IDs through the mirror node, decodes HTS token calls with a standard token ABI, and decodes other contract calls with the verified ABI from a Sourcify server, HashScan's by default.",
      source: SNAP_HANDLER,
    },
    methods: {
      text: "Each transaction is checked against the user's preferences: an allow list of contracts that skip the checks, a ban list of contracts to block, an HBAR amount that triggers a warning, and an option to interact with verified contracts only. With an API key set, an LLM adds a plain-language safety assessment of a call to a verified contract.",
      source: SNAP_HANDLER,
    },
    outcome: {
      text: 'Version 0.1.0 of the Snap, with a home page in MetaMask for its settings.',
      source: SNAP_MANIFEST,
    },
  },
  {
    slug: 'hip-explorer-agent',
    title: 'HIP explorer agent',
    proofIds: ['hip-explorer-agent'],
    source: OWNER,
    problem: {
      text: 'Finding which pull requests implemented a Hedera or Hiero Improvement Proposal takes manual cross-referencing across Hiero repos.',
      source: OWNER,
    },
    approach: {
      text: 'An agent that indexes Hedera and Hiero Improvement Proposals and maps each to its implementing PRs across Hiero repos. It answers in chat or through a read-only MCP server.',
      source: OWNER,
    },
    methods: {
      text: 'Owner actions are approval-gated, the guardrail config is anchored on HCS, and the agent has an eval harness.',
      source: OWNER,
    },
    outcome: {
      text: 'An agent that maps proposals to the PRs that implement them, queried in chat or from an MCP client.',
      source: OWNER,
    },
  },
  {
    slug: 'cross-ledger-explorer',
    title: 'Cross-ledger explorer',
    proofIds: ['cross-ledger-explorer'],
    source: OWNER,
    problem: {
      text: 'A CLPR message starts on one ledger and lands on another, and each ledger is read differently: EVM ledgers over JSON-RPC, Hiero ledgers through the mirror node.',
      source: OWNER,
    },
    approach: {
      text: 'An explorer for cross-ledger channels and message journeys. Each ledger is read by a plugin (EVM JSON-RPC, Hiero mirror node), and the plugins sit behind a conformance suite.',
      source: OWNER,
    },
    methods: {
      text: 'A build gate keeps chain libraries inside the ledger plugins.',
      source: OWNER,
    },
    outcome: {
      text: 'Message journeys can be replayed with evidence at every step.',
      source: OWNER,
    },
  },
  {
    slug: 'plumbing-of-money',
    title: 'The Plumbing of Money',
    proofIds: ['plumbing-of-money'],
    source: OWNER,
    problem: {
      text: 'Teaching how money actually moves, and how it is being rebuilt.',
      source: OWNER,
    },
    approach: {
      text: 'A course of written lessons with interactive widgets and Python exercises.',
      source: OWNER,
    },
    methods: {
      text: 'A governing spec, and post-build gates that read the built course.',
      source: OWNER,
    },
    outcome: {
      text: 'The course is written and live.',
      source: OWNER,
    },
  },
  {
    slug: 'onchain-finance-template',
    title: 'White-label on-chain finance template',
    proofIds: ['onchain-finance-template'],
    source: OWNER,
    problem: {
      text: 'A starting point for on-chain finance apps that a team can brand and connect to its own backend.',
      source: OWNER,
    },
    approach: {
      text: 'A white-label template for on-chain finance apps. All data is simulated by a seeded engine, so the template runs without a backend.',
      source: OWNER,
    },
    methods: {
      text: 'Every integration sits behind a swappable adapter.',
      source: OWNER,
    },
    outcome: {
      text: 'A fork can swap the simulated adapters for its own integrations.',
      source: OWNER,
    },
  },
]
