// One source of truth for the reduced-motion preference. Every animated path asks here first.
// The query is created on first use so this module can also be imported at build time.
let query: MediaQueryList | null = null
const reducedQuery = () => (query ??= window.matchMedia('(prefers-reduced-motion: reduce)'))

export function prefersReducedMotion(): boolean {
  return reducedQuery().matches
}

export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  const listener = (event: MediaQueryListEvent) => cb(event.matches)
  reducedQuery().addEventListener('change', listener)
  return () => reducedQuery().removeEventListener('change', listener)
}
