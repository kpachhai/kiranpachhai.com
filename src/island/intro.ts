// The sheet's intro: the settled sheet drawn again in the order a draughtsman would, about 2.6 s,
// once per session, with reduced motion off. The settled sheet is painted first; on the frame after,
// the intro measures the paths, and on the next it starts, so neither step is one long task.
// The times follow from the constants below and the model's counts of areas, trails, filled
// schedule cells and materials rows, so they move when either does:
//   0-500 ms      the frame: the dimension line draws out from its middle; its label, the north arrow and datum fade in
//   300-1300 ms   the contours draw, a level at a time, outward from the summits
//   1150-1940 ms  the summits seat and their names fade in
//   1600-2300 ms  the trails draw and their tags appear
//   1950-2350 ms  the schedule cells fill
//   2100-2650 ms  the materials rows draw in, languages first
// Only transform, opacity and stroke-dashoffset move, so nothing is laid out again. Every animation
// is fill: backwards, so cancelling one leaves its element exactly as the settled sheet has it.
// Stopping the intro is cancelling all of them.
import { onModalOpen } from './modal'
import { EASE, onReducedMotionChange, prefersReducedMotion } from './motion'
import { markSeenThisSession, seenThisSession } from './state'

export const INTRO_KEY = 'kp-intro-seen'

const FRAME_MS = 450
const CONTOURS_AT = 300
const LEVEL_STEP = 40
const CONTOUR_MS = 520
const SUMMITS_AT = 1150
const SUMMIT_STEP = 70
const TRAILS_AT = 1600
const TRAIL_STEP = 90
const TRAIL_MS = 520
const SCHEDULE_AT = 1950
const SCHEDULE_SPAN = 150
const MATERIALS_AT = 2100
const LANGUAGE_STEP = 45
const LATER_BANDS_AT = 2250
const LATER_BANDS_SPAN = 100
const ROW_MS = 300
// The trails' settled dots, in the same units as the stylesheet's stroke-dasharray: 2 5.
const DOT = 2
const DOT_GAP = 5

type Timing = { delay: number; duration: number }

function requireElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`intro: ${selector} is missing`)
  return found
}

// Every animation is kept in made as it is created, so a setup that fails partway can cancel them.
function play(made: Animation[], element: Element, keyframes: Keyframe[], timing: Timing, pseudoElement?: string): void {
  made.push(element.animate(keyframes, { ...timing, easing: EASE, fill: 'backwards', pseudoElement }))
}

const fadeIn = (made: Animation[], element: Element, timing: Timing) => play(made, element, [{ opacity: 0 }, { opacity: 1 }], timing)

// Only the drawing CSS shows is measured and animated; the other stays settled and unseen.
function shownDrawing(sheet: HTMLElement): SVGSVGElement {
  const shown = [...sheet.querySelectorAll<SVGSVGElement>('.sheet-drawing > svg')].find((svg) => svg.getClientRects().length > 0)
  if (!shown) throw new Error('intro: no drawing is shown')
  return shown
}

// The drawing shown and each of its paths' length on screen, read in one frame so the next only
// creates animations. Under vector-effect: non-scaling-stroke, Chromium, Firefox and WebKit all
// measure a dash in CSS pixels rather than the drawing's units, so a dash as long as the path on
// screen draws it to its end exactly as its animation ends.
interface Measured {
  svg: SVGSVGElement
  lengths: Map<SVGGeometryElement, number>
}

function measure(sheet: HTMLElement): Measured {
  const svg = shownDrawing(sheet)
  const scale = svg.getScreenCTM()?.a ?? 1
  const paths = [...svg.querySelectorAll<SVGGeometryElement>('path.contour, path.trail')]
  return { svg, lengths: new Map(paths.map((path) => [path, path.getTotalLength() * scale])) }
}

function lengthOf(measured: Measured, path: SVGGeometryElement): number {
  const length = measured.lengths.get(path)
  if (length === undefined) throw new Error('intro: a path was not measured')
  return length
}

function drawFrame(made: Animation[], sheet: HTMLElement): void {
  const dim = requireElement<HTMLElement>('.dim', sheet)
  const rule = [{ transform: 'scaleX(0)' }, { transform: 'none' }]
  play(made, dim, rule, { delay: 0, duration: FRAME_MS }, '::before')
  play(made, dim, rule, { delay: 0, duration: FRAME_MS }, '::after')
  fadeIn(made, requireElement('.dim-label', dim), { delay: 120, duration: 300 })
  for (const element of sheet.querySelectorAll('.north, .datum')) fadeIn(made, element, { delay: 200, duration: 300 })
}

function drawContours(made: Animation[], measured: Measured): void {
  const groups = [...measured.svg.querySelectorAll<SVGGElement>('g[data-level]')]
  const top = Math.max(...groups.map((group) => Number(group.dataset.level)))
  for (const group of groups) {
    const delay = CONTOURS_AT + (top - Number(group.dataset.level)) * LEVEL_STEP
    for (const path of group.querySelectorAll<SVGPathElement>('path.contour')) {
      const length = lengthOf(measured, path)
      const dash = `${length} ${length}`
      play(made, path, [{ strokeDasharray: dash, strokeDashoffset: length }, { strokeDasharray: dash, strokeDashoffset: 0 }], { delay, duration: CONTOUR_MS })
    }
  }
}

function seatSummits(made: Animation[], sheet: HTMLElement): void {
  for (const [position, summit] of [...sheet.querySelectorAll('a.summit')].entries()) {
    const at = SUMMITS_AT + position * SUMMIT_STEP
    play(made, requireElement('.peak', summit), [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { delay: at, duration: 380 })
    for (const label of summit.querySelectorAll('.no, .name, .meta')) fadeIn(made, label, { delay: at + 120, duration: 320 })
  }
}

// The settled dots, repeated to cover the trail, then one gap as long again: pulling the offset back
// to zero walks the dots out along the trail and ends on exactly the settled pattern.
function walkedDots(length: number): string {
  const dots = Math.ceil(length / (DOT + DOT_GAP))
  return `${Array<string>(dots - 1).fill(`${DOT} ${DOT_GAP}`).join(' ')} ${DOT} ${DOT_GAP + dots * (DOT + DOT_GAP)}`.trim()
}

// Each trail's tag is HTML over the drawing, found by the trail's method.
function drawTrails(made: Animation[], sheet: HTMLElement, measured: Measured): void {
  for (const [position, trail] of [...measured.svg.querySelectorAll<SVGPathElement>('path.trail')].entries()) {
    const delay = TRAILS_AT + position * TRAIL_STEP
    const length = lengthOf(measured, trail)
    const pattern = walkedDots(length)
    const total = Math.ceil(length / (DOT + DOT_GAP)) * (DOT + DOT_GAP)
    play(made, trail, [{ strokeDasharray: pattern, strokeDashoffset: total }, { strokeDasharray: pattern, strokeDashoffset: 0 }], { delay, duration: TRAIL_MS })
    fadeIn(made, requireElement(`.tag[data-method="${trail.dataset.method}"]`, sheet), { delay: delay + 220, duration: 260 })
  }
}

function fillSchedule(made: Animation[], sheet: HTMLElement): void {
  const cells = [...sheet.querySelectorAll('table.sched .cell.f')]
  const step = SCHEDULE_SPAN / Math.max(1, cells.length)
  for (const [position, cell] of cells.entries()) {
    play(made, cell, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], { delay: SCHEDULE_AT + position * step, duration: 260 })
  }
}

function drawMaterials(made: Animation[], sheet: HTMLElement): void {
  const row = [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }]
  const languages = [...sheet.querySelectorAll('.mat-band[data-band="language"] li[data-material]')]
  const later = [...sheet.querySelectorAll('.mat-band:not([data-band="language"]) li[data-material]')]
  const step = LATER_BANDS_SPAN / Math.max(1, later.length)
  for (const [position, item] of languages.entries()) play(made, item, row, { delay: MATERIALS_AT + position * LANGUAGE_STEP, duration: ROW_MS })
  for (const [position, item] of later.entries()) play(made, item, row, { delay: LATER_BANDS_AT + position * step, duration: ROW_MS })
}

// A setup that throws partway cancels what it already made, so no element is left faded or half
// drawn, and the error still surfaces.
function draw(sheet: HTMLElement, measured: Measured): Animation[] {
  const made: Animation[] = []
  try {
    drawFrame(made, sheet)
    drawContours(made, measured)
    seatSummits(made, sheet)
    drawTrails(made, sheet, measured)
    fillSchedule(made, sheet)
    drawMaterials(made, sheet)
  } catch (error) {
    for (const animation of made) animation.cancel()
    throw error
  }
  return made
}

// Skip is about to hide: a keyboard user on it lands on Replay, or on the first summit when Replay
// is not shown (reduced motion).
function handOffFocus(replay: HTMLElement): void {
  for (const target of [replay, document.querySelector<HTMLElement>('#sheet a.summit')]) {
    if (!target || target.getClientRects().length === 0) continue
    target.focus({ preventScroll: true })
    if (document.activeElement === target) return
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// Resolves once the intro has ended, whether it ran out or was stopped through the signal.
export async function runIntro(opts: { reduced: boolean; signal: AbortSignal }): Promise<void> {
  if (opts.reduced || opts.signal.aborted) return
  const sheet = requireElement<HTMLElement>('#sheet')
  const skip = requireElement<HTMLButtonElement>('#intro-skip')
  const replay = requireElement<HTMLButtonElement>('#intro-replay')
  markSeenThisSession(INTRO_KEY)
  const measured = measure(sheet)
  await nextFrame()
  if (opts.signal.aborted) return
  const animations = draw(sheet, measured)
  sheet.dataset.intro = 'play'
  skip.hidden = false
  return new Promise((resolve) => {
    let over = false
    const end = () => {
      if (over) return
      over = true
      opts.signal.removeEventListener('abort', end)
      for (const animation of animations) animation.cancel()
      delete sheet.dataset.intro
      if (document.activeElement === skip) handOffFocus(replay)
      skip.hidden = true
      resolve()
    }
    opts.signal.addEventListener('abort', end)
    void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(end)
  })
}

// Two frames on: the first is painted with the settled sheet before anything animates.
const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

// Wires Skip and Replay and everything else that ends the intro: search opening, a width change
// (which can swap the drawing), a new hash, and reduced motion turning on.
export function initIntro(): void {
  const skip = requireElement<HTMLButtonElement>('#intro-skip')
  const replay = requireElement<HTMLButtonElement>('#intro-replay')
  let controller: AbortController | null = null

  // Any stop counts the intro as seen, even one in the wait for first paint, before it marked itself.
  const stop = () => {
    if (controller) markSeenThisSession(INTRO_KEY)
    controller?.abort()
    controller = null
  }
  const start = async (opts: { waitForPaint: boolean }) => {
    stop()
    const mine = new AbortController()
    controller = mine
    if (opts.waitForPaint) await afterPaint()
    await runIntro({ reduced: prefersReducedMotion(), signal: mine.signal })
    if (controller === mine) controller = null
  }

  let width = window.innerWidth
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return
    width = window.innerWidth
    stop()
  })
  window.addEventListener('hashchange', stop)
  onModalOpen(stop)
  onReducedMotionChange((reduced) => {
    if (reduced) stop()
  })

  // The intro's end hands focus on when Skip had it; a browser that does not focus a clicked
  // button leaves focus on the page, and Replay takes it there too.
  skip.addEventListener('click', () => {
    stop()
    if (document.activeElement === document.body) handOffFocus(replay)
  })
  replay.addEventListener('click', () => void start({ waitForPaint: false }))

  if (!prefersReducedMotion() && !seenThisSession(INTRO_KEY)) void start({ waitForPaint: true })
}
