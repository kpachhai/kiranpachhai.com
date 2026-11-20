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
  const previous = current
  const leavingId = entered
  current = id
  const context: LensContext = { stage, from: shown, to: id, animate: animate && !prefersReducedMotion() }
  const leaving = leavingId ? renderers.get(leavingId) : undefined
  entered = null
  if (leaving?.leave) {
    try {
      await leaving.leave(context)
    } catch (error) {
      // A rejected leave undoes the switch, so asking for the same lens again retries it.
      if (mine === generation) {
        current = previous
        entered = leavingId
      }
      throw error
    }
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

// The lens last shown, kept for the session so case-study pages draw their diagram in it
// (read before first paint by the inline script in work/[slug].astro).
export const LENS_KEY = 'kp-lens'

export function rememberLens(id: LensId): void {
  try {
    window.sessionStorage.setItem(LENS_KEY, id)
  } catch {
    // Storage unavailable: case-study pages fall back to the default lens.
  }
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

const shortcutSubscribers = new Set<(on: boolean) => void>()

export function setShortcutsEnabled(on: boolean): void {
  shortcutsOn = on
  try {
    if (on) window.localStorage.removeItem(SHORTCUTS_KEY)
    else window.localStorage.setItem(SHORTCUTS_KEY, 'off')
  } catch {
    // Storage unavailable: the choice holds for this visit.
  }
  for (const cb of shortcutSubscribers) cb(on)
}

export function onShortcutsChange(cb: (on: boolean) => void): () => void {
  shortcutSubscribers.add(cb)
  return () => shortcutSubscribers.delete(cb)
}

// The lens a press of 1 to 5 asks for, or null. The physical key (code) is read first, so a layout
// that needs Shift for digits (AZERTY) still works; the typed character is the fallback.
export function lensForKey(event: Pick<KeyboardEvent, 'key' | 'code'>): LensId | null {
  const digit = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)?.[1] ?? (/^[1-5]$/.test(event.key) ? event.key : null)
  return digit ? LENSES[Number(digit) - 1] : null
}

// Once-per-session flags (the intro, the role cycle). Storage can throw; the flag then reads unset,
// so the motion may play again on the next load, which is harmless.
export function seenThisSession(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function markSeenThisSession(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Storage unavailable: nothing to remember.
  }
}
