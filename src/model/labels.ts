import type { Upstream } from './schema'

// Display labels for upstream statuses, shared by the Upstream section and the island drawer.
export const STATUS_LABELS: Record<Upstream['status'], string> = {
  merged: 'Merged',
  open: 'Open',
  review: 'Reviewed',
  discussion: 'Discussion',
  commits: 'Commits',
}
