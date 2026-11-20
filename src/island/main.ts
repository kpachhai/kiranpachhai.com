// Island entry: wires the bar, the drawer, the palette and the lens state onto the static page.
// Without JavaScript none of this runs and the static Index list in #stage stays the page;
// with it, stage.ts turns that list into the lens nodes.
import { readIslandData } from './data'
import { initDrawer, isDrawerOpen, onDrawerChange } from './drawer'
import { initPalette, isPaletteOpen } from './palette'
import { initStage } from './stage'
import {
  LENSES,
  THEMES,
  currentTheme,
  lensFromHash,
  onLensChange,
  onThemeChange,
  setLens,
  setTheme,
  shortcutsEnabled,
  startLens,
} from './state'

function requireElement(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`island: #${id} is missing`)
  return found
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function bindLensKeys(): void {
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
    if (!shortcutsEnabled() || isPaletteOpen() || isDrawerOpen()) return
    const position = Number(event.key) - 1
    const lens = LENSES[position]
    if (Number.isInteger(position) && lens) void setLens(lens)
  })
  for (const button of document.querySelectorAll<HTMLElement>('[data-lens-button]')) {
    button.addEventListener('click', () => void setLens(button.dataset.lensButton as (typeof LENSES)[number]))
  }
  window.addEventListener('hashchange', () => {
    const lens = lensFromHash(window.location.hash)
    if (lens) void setLens(lens)
  })
}

function bindThemeControl(): void {
  const control = requireElement('theme-toggle')
  const label = () => {
    control.textContent = `Theme: ${currentTheme()}`
  }
  control.addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]))
  onThemeChange(label)
  label()
}

// The side drawer opens below the sticky bar, so the bar's live height feeds --bar-h.
function measureBar(): void {
  const bar = document.querySelector<HTMLElement>('header.bar')
  if (!bar) return
  const write = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`)
  write()
  new ResizeObserver(write).observe(bar)
}

function announce(live: HTMLElement): void {
  onLensChange((lens) => {
    live.textContent = `Lens: ${lens}`
  })
  onDrawerChange((target) => {
    if (target) live.textContent = `Showing ${requireElement('drawer-title').textContent ?? ''}`
  })
}

function main(): void {
  const stage = requireElement('stage')
  const data = readIslandData()
  initStage(stage, data)
  initDrawer(data)
  initPalette(data)
  bindLensKeys()
  bindThemeControl()
  measureBar()
  announce(requireElement('island-live'))
  // A rejection stays unhandled on purpose: it surfaces in the console instead of a silent half-island.
  void startLens(stage).then(() => {
    document.documentElement.dataset.island = 'ready'
  })
}

main()
