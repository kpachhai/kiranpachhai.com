import type { Role } from '../schema'
import { LINKEDIN } from './sources'

// Roles actually held, employer-free, in the order the hero cycles through them.
export const roles: Role[] = [
  { title: 'software engineer', years: '2014-2016', proofIds: [], source: LINKEDIN },
  { title: 'SRE', years: '2016-2018', proofIds: ['rsyslog-exporter'], source: LINKEDIN },
  { title: 'technical lead', years: '2020-2023', proofIds: ['identify-snap', 'hedera-wallet-snap'], source: LINKEDIN },
  { title: 'blockchain architect', years: '2023-2025', proofIds: ['l1-vm'], source: LINKEDIN },
  { title: 'course instructor', years: '2022-2023', proofIds: ['web3-101-course'], source: LINKEDIN },
  { title: 'developer advocate', years: '2025 to now', proofIds: ['hedera-docs-tutorials'], source: LINKEDIN },
]
