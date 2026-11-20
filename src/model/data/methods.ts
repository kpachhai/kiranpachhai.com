import type { Method } from '../schema'
import { OWNER } from './sources'

// Proofs carry their method ids; a method's projects are the proofs that list it.
export const methods: Method[] = [
  { id: 'A', name: 'Spec first', source: OWNER },
  { id: 'B', name: 'Staged gates', source: OWNER },
  { id: 'C', name: 'Provenance', summary: 'Every claim traces to a source.', source: OWNER },
  { id: 'D', name: 'Plugin standards', source: OWNER },
  { id: 'E', name: 'Explain it visually', source: OWNER },
]
