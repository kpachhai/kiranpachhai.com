// The journey's toolkit fills as the stops scroll by. The page ships the complete toolkit; with
// motion allowed this module empties it, and as each stop reaches the upper part of the viewport
// its new chips fly into the toolkit (transform and opacity only, no scroll hijack). The toolkit
// only grows: scrolling back up never empties a slot. Reduced motion keeps the complete toolkit.
import { EASE, onReducedMotionChange, prefersReducedMotion } from './motion'

const FLY_MS = 700
const FLY_STAGGER_MS = 45
const LAND_MS = 220
// A stop counts as reached once it enters the top 60% of the viewport.
const REACH_MARGIN = '0px 0px -40% 0px'
const REACH_LINE = 0.6

interface Toolkit {
  items: Map<string, HTMLElement>
  count: HTMLElement
  body: HTMLElement
}

function requireIn<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`journey: ${selector} is missing`)
  return found
}

// On phones and tablets the toolkit body sits behind a button. CSS keeps it collapsed from first
// paint (html.js without data-open), so a deep link never shifts; on desktops it is always shown.
function bindToggle(root: HTMLElement, body: HTMLElement): void {
  const toggle = requireIn<HTMLButtonElement>(root, '.tk-toggle')
  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? 'Hide' : 'Show'
    toggle.setAttribute('aria-label', open ? 'Hide toolkit' : 'Show toolkit')
    body.toggleAttribute('data-open', open)
  }
  setOpen(false)
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))
}

function writeCount(toolkit: Toolkit): void {
  const earned = [...toolkit.items.values()].filter((item) => item.dataset.state === 'earned').length
  toolkit.count.textContent = `${earned} of ${toolkit.items.size} skills`
}

function land(toolkit: Toolkit, item: HTMLElement, animate: boolean): void {
  item.dataset.state = 'earned'
  writeCount(toolkit)
  if (animate) item.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: LAND_MS, easing: 'linear' })
}

// Where a chip lands: its slot when the slot is on screen, otherwise the count in the toolkit header.
function landingRect(toolkit: Toolkit, item: HTMLElement): DOMRect {
  const slot = item.getBoundingClientRect()
  const panel = toolkit.body.getBoundingClientRect()
  // checkVisibility needs Safari 17.4; an element with no layout box has no offsetParent.
  const visible = typeof item.checkVisibility === 'function' ? item.checkVisibility() : item.offsetParent !== null
  const shown = visible && slot.top >= Math.max(0, panel.top) && slot.bottom <= Math.min(window.innerHeight, panel.bottom)
  return shown ? slot : toolkit.count.getBoundingClientRect()
}

function fly(toolkit: Toolkit, chip: HTMLElement, item: HTMLElement, delay: number): void {
  const from = chip.getBoundingClientRect()
  const to = landingRect(toolkit, item)
  const ghost = document.createElement('span')
  ghost.className = 'jy-fly'
  ghost.setAttribute('aria-hidden', 'true')
  ghost.textContent = chip.textContent
  ghost.style.left = `${from.left}px`
  ghost.style.top = `${from.top}px`
  document.body.append(ghost)
  const flight = ghost.animate(
    [
      { transform: 'translate(0px, 0px)', opacity: 1 },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)`, opacity: 0.35 },
    ],
    { duration: FLY_MS, delay, easing: EASE, fill: 'backwards' },
  )
  const done = () => {
    ghost.remove()
    land(toolkit, item, !prefersReducedMotion())
  }
  flight.finished.then(done, done)
}

export function initJourney(): void {
  const root = document.querySelector<HTMLElement>('[data-journey]')
  if (!root) return
  const toolkit: Toolkit = {
    items: new Map([...root.querySelectorAll<HTMLElement>('.toolkit li[data-skill]')].map((item) => [item.dataset.skill ?? '', item])),
    count: requireIn<HTMLElement>(root, '[data-tk-count]'),
    body: requireIn<HTMLElement>(root, '#tk-body'),
  }
  bindToggle(root, toolkit.body)
  const stops = [...root.querySelectorAll<HTMLElement>('.stop[data-stop]')]
  const chipsOf = (stop: HTMLElement) => [...stop.querySelectorAll<HTMLElement>('.chips li[data-chip]')]
  const itemOf = (chip: HTMLElement) => {
    const item = toolkit.items.get(chip.dataset.chip ?? '')
    if (!item) throw new Error(`journey: no toolkit slot for ${chip.dataset.chip}`)
    return item
  }

  if (prefersReducedMotion()) {
    for (const item of toolkit.items.values()) item.dataset.state = 'earned'
    writeCount(toolkit)
    return
  }

  for (const item of toolkit.items.values()) item.dataset.state = 'empty'
  let reached = -1
  const reachThrough = (index: number, animate: boolean) => {
    let order = 0
    for (let position = reached + 1; position <= index; position++) {
      for (const chip of chipsOf(stops[position])) {
        const item = itemOf(chip)
        if (animate) fly(toolkit, chip, item, order++ * FLY_STAGGER_MS)
        else land(toolkit, item, false)
      }
    }
    reached = Math.max(reached, index)
  }

  // Stops already above the line on load (a reload mid-page, a deep link) fill without flying.
  const line = window.innerHeight * REACH_LINE
  let above = -1
  stops.forEach((stop, position) => {
    if (stop.getBoundingClientRect().top < line) above = position
  })
  reachThrough(above, false)
  writeCount(toolkit)

  const observer = new IntersectionObserver(
    (entries) => {
      const furthest = Math.max(-1, ...entries.filter((entry) => entry.isIntersecting).map((entry) => stops.indexOf(entry.target as HTMLElement)))
      if (furthest > reached) reachThrough(furthest, true)
      if (reached === stops.length - 1) observer.disconnect()
    },
    { rootMargin: REACH_MARGIN },
  )
  for (const stop of stops) observer.observe(stop)

  // Reduced motion switched on part way: land every chip in flight and show the complete toolkit.
  onReducedMotionChange((reduced) => {
    if (!reduced) return
    observer.disconnect()
    for (const ghost of document.querySelectorAll<HTMLElement>('.jy-fly')) for (const flight of ghost.getAnimations()) flight.finish()
    for (const item of toolkit.items.values()) item.dataset.state = 'earned'
    writeCount(toolkit)
  })
}
