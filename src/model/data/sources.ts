import type { Source } from '../schema'

// Owner decisions and statements recorded in the disclosure table on this date.
export const OWNER: Source = { kind: 'owner', date: '2026-11-19' }
// Owner answers on the career figures, recorded on this date; shown as text with no link.
export const OWNER_FIGURES: Source = { kind: 'owner', date: '2026-11-20' }
// The previous site's portfolio list, public in this repository's history.
export const OLD_PORTFOLIO: Source = {
  kind: 'url',
  url: 'https://github.com/kpachhai/kiranpachhai.com/blob/c3f14c8/src/data/portfolio.json',
}
export const LINKEDIN: Source = { kind: 'linkedin' }

export function url(address: string): Source {
  return { kind: 'url', url: address }
}
