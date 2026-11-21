// Island state: which theme the page uses and the once-per-session flags.

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
