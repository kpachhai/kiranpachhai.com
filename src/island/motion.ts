// One source of truth for the reduced-motion preference. Every animated path asks here first.
// The query is created on first use so this module can also be imported at build time.
// The ease-out curve every scripted animation uses; the same curve as --ease in tokens.css.
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

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
