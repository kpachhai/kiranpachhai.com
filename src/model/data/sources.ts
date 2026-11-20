import type { Source } from '../schema'

// Owner decisions and statements recorded in the disclosure table on this date.
export const OWNER: Source = { kind: 'owner', date: '2026-11-19' }
export const LINKEDIN: Source = { kind: 'linkedin' }
export const LINKEDIN_PROFILE = 'https://linkedin.com/in/kiranpachhai'

export function url(address: string): Source {
  return { kind: 'url', url: address }
}
