import type { Talk } from '../schema'
import { LINKEDIN, LINKEDIN_PROFILE, OWNER, url } from './sources'

const GH = 'https://github.com'

export const talks: Talk[] = [
  {
    id: 'hedera-devday-2026',
    title: 'Hedera DevDay',
    kind: 'talk',
    detail: 'Denver',
    date: '2026-02-17',
    href: `${GH}/hedera-dev/devday-tutorial-hello-scheduled-world`,
    source: OWNER,
  },
  {
    id: 'onchain-automation-workshop',
    title: 'Deploying Smart Contracts with Native On-Chain Automation',
    kind: 'workshop',
    detail: 'LinkedIn Live workshop',
    href: LINKEDIN_PROFILE,
    source: LINKEDIN,
  },
  {
    id: 'cross-ledger-session',
    title: 'Cross-ledger early adopter session',
    kind: 'session',
    detail: 'Technical session explaining CLPR',
    href: LINKEDIN_PROFILE,
    source: LINKEDIN,
  },
  {
    id: 'web3-101',
    title: 'Web3 101 course',
    kind: 'course',
    detail: '2022',
    href: `${GH}/EatTheBlocks/web3-101`,
    source: LINKEDIN,
  },
  {
    id: 'hedera-docs-tutorials',
    title: 'Hedera docs tutorials',
    kind: 'tutorials',
    detail: 'Fork testing, parts 1 and 2, and schedule service',
    href: `${GH}/hashgraph/hedera-docs/pull/375`,
    source: url(`${GH}/hashgraph/hedera-docs/pull/375`),
  },
]
