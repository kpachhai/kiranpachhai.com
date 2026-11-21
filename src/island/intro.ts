// The sheet's intro: the settled sheet drawn again in the order a draughtsman would, about 2.5 s,
// once per session, with reduced motion off. The settled sheet is painted first; the intro starts on
// the frame after.
//   0-450 ms      the frame: the dimension line draws out from its middle; the north arrow and datum fade in
//   300-1300 ms   the contours draw, a level at a time, outward from the summits
//   1150-1900 ms  the summits seat and their names fade in
//   1600-2400 ms  the trails draw and their tags appear
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

function play(element: Element, keyframes: Keyframe[], timing: Timing, pseudoElement?: string): Animation {
  return element.animate(keyframes, { ...timing, easing: EASE, fill: 'backwards', pseudoElement })
}

const fadeIn = (element: Element, timing: Timing) => play(element, [{ opacity: 0 }, { opacity: 1 }], timing)

// Only the drawing CSS shows is measured and animated; the other stays settled and unseen.
function shownDrawing(sheet: HTMLElement): SVGSVGElement {
  const shown = [...sheet.querySelectorAll<SVGSVGElement>('.sheet-drawing > svg')].find((svg) => svg.getClientRects().length > 0)
  if (!shown) throw new Error('intro: no drawing is shown')
  return shown
}

// A dash long enough to cover the path in user units and in screen pixels, which a browser may use
// for a non-scaling stroke.
function dashLength(path: SVGGeometryElement, scale: number): number {
  return Math.ceil(path.getTotalLength() * Math.max(1, scale))
}

function drawFrame(sheet: HTMLElement): Animation[] {
  const dim = requireElement<HTMLElement>('.dim', sheet)
  const rule = [{ transform: 'scaleX(0)' }, { transform: 'none' }]
  return [
    play(dim, rule, { delay: 0, duration: FRAME_MS }, '::before'),
    play(dim, rule, { delay: 0, duration: FRAME_MS }, '::after'),
    fadeIn(requireElement('.dim-label', dim), { delay: 120, duration: 300 }),
    ...[...sheet.querySelectorAll('.north, .datum')].map((element) => fadeIn(element, { delay: 200, duration: 300 })),
  ]
}

function drawContours(svg: SVGSVGElement, scale: number): Animation[] {
  const groups = [...svg.querySelectorAll<SVGGElement>('g[data-level]')]
  const top = Math.max(...groups.map((group) => Number(group.dataset.level)))
  return groups.flatMap((group) => {
    const delay = CONTOURS_AT + (top - Number(group.dataset.level)) * LEVEL_STEP
    return [...group.querySelectorAll<SVGPathElement>('path.contour')].map((path) => {
      const length = dashLength(path, scale)
      const dash = `${length} ${length}`
      return play(path, [{ strokeDasharray: dash, strokeDashoffset: length }, { strokeDasharray: dash, strokeDashoffset: 0 }], { delay, duration: CONTOUR_MS })
    })
  })
}

function seatSummits(sheet: HTMLElement): Animation[] {
  return [...sheet.querySelectorAll('a.summit')].flatMap((summit, position) => {
    const at = SUMMITS_AT + position * SUMMIT_STEP
    const peak = requireElement('.peak', summit)
    return [
      play(peak, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { delay: at, duration: 380 }),
      ...[...summit.querySelectorAll('.no, .name, .meta')].map((label) => fadeIn(label, { delay: at + 120, duration: 320 })),
    ]
  })
}

// The settled dots, repeated to cover the trail, then one gap as long again: pulling the offset back
// to zero walks the dots out along the trail and ends on exactly the settled pattern.
function walkedDots(length: number): string {
  const dots = Math.ceil(length / (DOT + DOT_GAP))
  return `${Array<string>(dots - 1).fill(`${DOT} ${DOT_GAP}`).join(' ')} ${DOT} ${DOT_GAP + dots * (DOT + DOT_GAP)}`.trim()
}

// Each trail's tag is HTML over the drawing, found by the trail's method.
function drawTrails(sheet: HTMLElement, svg: SVGSVGElement, scale: number): Animation[] {
  return [...svg.querySelectorAll<SVGPathElement>('path.trail')].flatMap((trail, position) => {
    const delay = TRAILS_AT + position * TRAIL_STEP
    const length = dashLength(trail, scale)
    const pattern = walkedDots(length)
    const total = Math.ceil(length / (DOT + DOT_GAP)) * (DOT + DOT_GAP)
    const walk = play(trail, [{ strokeDasharray: pattern, strokeDashoffset: total }, { strokeDasharray: pattern, strokeDashoffset: 0 }], { delay, duration: TRAIL_MS })
    const tag = requireElement(`.tag[data-method="${trail.dataset.method}"]`, sheet)
    return [walk, fadeIn(tag, { delay: delay + 220, duration: 260 })]
  })
}

function fillSchedule(sheet: HTMLElement): Animation[] {
  const cells = [...sheet.querySelectorAll('table.sched .cell.f')]
  const step = SCHEDULE_SPAN / Math.max(1, cells.length)
  return cells.map((cell, position) =>
    play(cell, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], { delay: SCHEDULE_AT + position * step, duration: 260 }),
  )
}

function drawMaterials(sheet: HTMLElement): Animation[] {
  const row = [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }]
  const languages = [...sheet.querySelectorAll('.mat-band[data-band="language"] li[data-material]')]
  const later = [...sheet.querySelectorAll('.mat-band:not([data-band="language"]) li[data-material]')]
  const step = LATER_BANDS_SPAN / Math.max(1, later.length)
  return [
    ...languages.map((item, position) => play(item, row, { delay: MATERIALS_AT + position * LANGUAGE_STEP, duration: ROW_MS })),
    ...later.map((item, position) => play(item, row, { delay: LATER_BANDS_AT + position * step, duration: ROW_MS })),
  ]
}

function draw(sheet: HTMLElement): Animation[] {
  const svg = shownDrawing(sheet)
  const scale = svg.getScreenCTM()?.a ?? 1
  return [...drawFrame(sheet), ...drawContours(svg, scale), ...seatSummits(sheet), ...drawTrails(sheet, svg, scale), ...fillSchedule(sheet), ...drawMaterials(sheet)]
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

// Resolves once the intro has ended, whether it ran out or was stopped through the signal.
export function runIntro(opts: { reduced: boolean; signal: AbortSignal }): Promise<void> {
  if (opts.reduced || opts.signal.aborted) return Promise.resolve()
  const sheet = requireElement<HTMLElement>('#sheet')
  const skip = requireElement<HTMLButtonElement>('#intro-skip')
  const replay = requireElement<HTMLButtonElement>('#intro-replay')
  markSeenThisSession(INTRO_KEY)
  const animations = draw(sheet)
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

  const stop = () => {
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
