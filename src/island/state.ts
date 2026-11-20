// Island state: which lens the stage shows, and which theme the page uses.
// setLens only switches state; drawing a lens belongs to the renderer registered for it.
import { prefersReducedMotion } from './motion'

export const LENSES = ['plan', 'terrain', 'console', 'index', 'range'] as const
export type LensId = (typeof LENSES)[number]
export const DEFAULT_LENS: LensId = 'plan'

export interface LensContext {
  stage: HTMLElement
  from: LensId | null
  to: LensId
  animate: boolean
}

// Contract for lens renderers (Task 9 onward):
// - enter draws `to` inside `stage`; leave tears down the lens that last entered. leave is only
//   called on a lens whose enter has started, never twice for one enter.
// - from is the lens last written to the stage, or null on the first lens of the visit.
// - A newer switch can start while enter or leave is still awaiting. state.ts drops its own
//   stale writes; a renderer should check currentLens() === context.to before committing late work.
export interface LensRenderer {
  enter(context: LensContext): void | Promise<void>
  leave?(context: LensContext): void | Promise<void>
}

const HASH_PREFIX = '#lens-'
const renderers = new Map<LensId, LensRenderer>()
const subscribers = new Set<(id: LensId) => void>()
let stageRoot: HTMLElement | null = null
let current: LensId | null = null
let shown: LensId | null = null
let entered: LensId | null = null
let generation = 0

export const isLensId = (value: unknown): value is LensId => (LENSES as readonly unknown[]).includes(value)

export function lensFromHash(hash: string): LensId | null {
  const id = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null
  return isLensId(id) ? id : null
}

export function currentLens(): LensId | null {
  return current
}

export function registerLens(id: LensId, renderer: LensRenderer): () => void {
  renderers.set(id, renderer)
  return () => {
    if (renderers.get(id) === renderer) renderers.delete(id)
  }
}

export function onLensChange(cb: (id: LensId) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function syncControls(id: LensId): void {
  for (const button of document.querySelectorAll<HTMLElement>('[data-lens-button]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lensButton === id))
  }
}

function writeHash(id: LensId): void {
  const url = new URL(window.location.href)
  url.hash = `${HASH_PREFIX}${id}`
  // replaceState never scrolls and never adds a history entry per lens switch.
  window.history.replaceState(window.history.state, '', url)
}

// Each switch takes a generation number; after every await, a switch that is no longer the
// latest stops before it writes the stage, the hash, the buttons or the subscribers.
async function switchLens(id: LensId, animate: boolean, persist: boolean): Promise<void> {
  if (!isLensId(id)) throw new Error(`setLens: unknown lens ${String(id)}`)
  if (!stageRoot) throw new Error('setLens: no stage bound; call startLens first')
  if (id === current) return
  const mine = ++generation
  const stage = stageRoot
  current = id
  const context: LensContext = { stage, from: shown, to: id, animate: animate && !prefersReducedMotion() }
  const leaving = entered ? renderers.get(entered) : undefined
  entered = null
  if (leaving?.leave) {
    await leaving.leave(context)
    if (mine !== generation) return
  }
  stage.dataset.lens = id
  shown = id
  syncControls(id)
  if (persist) writeHash(id)
  for (const cb of subscribers) cb(id)
  const renderer = renderers.get(id)
  if (!renderer) return
  entered = id
  await renderer.enter(context)
}

export function setLens(id: LensId, opts: { animate?: boolean } = {}): Promise<void> {
  return switchLens(id, opts.animate ?? true, true)
}

// First lens of the visit: from #lens-<id>, else the default. It leaves the URL alone so a
// section anchor such as #work keeps working; the hash changes on the first real switch.
export function startLens(stage: HTMLElement): Promise<void> {
  stageRoot = stage
  return switchLens(lensFromHash(window.location.hash) ?? DEFAULT_LENS, false, false)
}

// Theme. The inline script in Base.astro applies the stored value before first paint;
// this module keeps it in step afterwards. Storage can throw (private mode, blocked site data).
export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
export const THEME_KEY = 'kp-theme'
const themeSubscribers = new Set<(theme: Theme) => void>()

export function currentTheme(): Theme {
  const value = document.documentElement.getAttribute('data-theme')
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function setTheme(t: Theme): void {
  if (!THEMES.includes(t)) throw new Error(`setTheme: unknown theme ${String(t)}`)
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  try {
    if (t === 'system') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, t)
  } catch {
    // Storage unavailable: the theme still applies for this visit.
  }
  for (const cb of themeSubscribers) cb(t)
}

export function onThemeChange(cb: (theme: Theme) => void): () => void {
  themeSubscribers.add(cb)
  return () => themeSubscribers.delete(cb)
}

// Keys 1 to 5 are single-character shortcuts, so WCAG 2.1.4 needs a way to turn them off.
// On by default; "off" is stored, "on" clears the key.
export const SHORTCUTS_KEY = 'kp-shortcuts'
let shortcutsOn: boolean | null = null

export function shortcutsEnabled(): boolean {
  if (shortcutsOn === null) {
    try {
      shortcutsOn = window.localStorage.getItem(SHORTCUTS_KEY) !== 'off'
    } catch {
      shortcutsOn = true
    }
  }
  return shortcutsOn
}

export function setShortcutsEnabled(on: boolean): void {
  shortcutsOn = on
  try {
    if (on) window.localStorage.removeItem(SHORTCUTS_KEY)
    else window.localStorage.setItem(SHORTCUTS_KEY, 'off')
  } catch {
    // Storage unavailable: the choice holds for this visit.
  }
}
