// Island entry: wires the bar, the palette and the sheet's controls onto the static page.
// Without JavaScript none of this runs: each summit links to its area in the static list under the
// sheet. With it, that list is hidden and the sheet's readout shows an area or a material instead.
import { readIslandData } from './data'
import { initIntro } from './intro'
import { initJourney } from './journey'
import { prefersReducedMotion } from './motion'
import { initPalette } from './palette'
import { ROLES_KEY, runRoleCycle } from './roles'
import './settings'
import { initSheet } from './sheet'
import { markSeenThisSession, seenThisSession } from './state'

function requireElement(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`island: #${id} is missing`)
  return found
}

// Sticky offsets below the bar (the journey's toolkit, scroll margins) read its live height from --bar-h.
function measureBar(): void {
  const bar = document.querySelector<HTMLElement>('header.bar')
  if (!bar) return
  const write = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`)
  write()
  new ResizeObserver(write).observe(bar)
}

// Once per session the hero's role line steps through the roles held; reduced motion keeps the
// settled line, and the static roles list shows instead.
function cycleRoles(roles: { title: string }[]): void {
  if (prefersReducedMotion() || seenThisSession(ROLES_KEY)) return
  markSeenThisSession(ROLES_KEY)
  void runRoleCycle(requireElement('role-box'), roles, { reduced: false })
}

function main(): void {
  const data = readIslandData()
  measureBar()
  initPalette(data)
  initSheet(data)
  cycleRoles(data.roles)
  initJourney()
  document.documentElement.dataset.island = 'ready'
  initIntro()
}

main()
