// Island entry: wires the bar, the drawer, the palette and the lens state onto the static page.
// Without JavaScript none of this runs and the static Index list in #stage stays the page;
// with it, stage.ts turns that list into the lens nodes.
import { initBom } from './bom'
import { readIslandData } from './data'
import { isTyping } from './dom'
import { initDrawer, isDrawerOpen, onDrawerChange } from './drawer'
import { initIntro } from './intro'
import { initJourney } from './journey'
import { prefersReducedMotion } from './motion'
import { initPalette, isPaletteOpen } from './palette'
import { initRangeView } from './rangeView'
import { ROLES_KEY, runRoleCycle } from './roles'
import { initStage } from './stage'
import './settings'
import {
  LENSES,
  lensForKey,
  lensFromHash,
  markSeenThisSession,
  onLensChange,
  rememberLens,
  seenThisSession,
  setLens,
  shortcutsEnabled,
  startLens,
} from './state'

function requireElement(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`island: #${id} is missing`)
  return found
}

function bindLensKeys(): void {
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
    if (!shortcutsEnabled() || isPaletteOpen() || isDrawerOpen()) return
    const lens = lensForKey(event)
    if (lens) void setLens(lens)
  })
  for (const button of document.querySelectorAll<HTMLElement>('[data-lens-button]')) {
    button.addEventListener('click', () => void setLens(button.dataset.lensButton as (typeof LENSES)[number]))
  }
  window.addEventListener('hashchange', () => {
    const lens = lensFromHash(window.location.hash)
    if (lens) void setLens(lens)
  })
}

// The side drawer opens below the sticky bar, so the bar's live height feeds --bar-h.
function measureBar(): void {
  const bar = document.querySelector<HTMLElement>('header.bar')
  if (!bar) return
  const write = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`)
  write()
  new ResizeObserver(write).observe(bar)
}

// The live region names a lens switch by its display name, from the first switch the visitor
// makes (the lens a visit starts on is not news). Opening the drawer moves focus to its heading,
// which is announced already; only a step to the next or previous area is announced here.
let announceLenses = false

function announce(live: HTMLElement): void {
  onLensChange((lens) => {
    if (announceLenses) live.textContent = `Lens: ${lens[0].toUpperCase()}${lens.slice(1)}`
  })
  let open = false
  onDrawerChange((target) => {
    if (target && open) live.textContent = `Showing ${requireElement('drawer-title').textContent ?? ''}`
    open = target !== null
  })
}

// Once per session the hero's role line steps through the roles held; reduced motion keeps the
// settled line, and the static roles list shows instead.
function cycleRoles(roles: { title: string }[]): void {
  if (prefersReducedMotion() || seenThisSession(ROLES_KEY)) return
  markSeenThisSession(ROLES_KEY)
  void runRoleCycle(requireElement('role-box'), roles, { reduced: false })
}

function main(): void {
  const stage = requireElement('stage')
  const data = readIslandData()
  initStage(stage, data)
  initRangeView(stage, requireElement('island-live'))
  initDrawer(data)
  initPalette(data)
  initBom()
  bindLensKeys()
  measureBar()
  announce(requireElement('island-live'))
  cycleRoles(data.roles)
  onLensChange(rememberLens)
  initJourney()
  // A rejection stays unhandled on purpose: it surfaces in the console instead of a silent half-island.
  void startLens(stage).then(() => {
    announceLenses = true
    document.documentElement.dataset.island = 'ready'
    initIntro()
  })
}

main()
