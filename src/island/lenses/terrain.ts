// Terrain lens: the six areas of work as summits of equal height on one contour canvas, with the
// methods they share drawn as trails between them. Loaded with a dynamic import on first use, so
// the initial route never carries it. layout, height, summitsOf, elevation and trails are pure;
// decorate owns the one canvas and its drift loop, and release gives both back.
import type { MethodId } from '../../model/schema'
import { onReducedMotionChange, prefersReducedMotion } from '../motion'
import { onThemeChange } from '../state'
import { contours } from './contours'
import {
  BREAK_TABLET,
  type LayoutOptions,
  type LensModel,
  type NodeLayout,
  type StageRect,
  decoGroup,
  drawIn,
  fadeIn,
  html,
  htmlBlock,
  lineCount,
  methodsOf,
  present,
  rootRem,
  scaleOf,
  svgEl,
} from './shared'

export const LEGEND = 'Summits are areas of work. Trails are shared methods.'

// Summit positions as fractions of the canvas. Narrow columns sit far enough apart that two labels
// never share an x range, so a label can grow downwards with larger text.
const SUMMITS_WIDE: [number, number][] = [[0.16, 0.28], [0.47, 0.19], [0.8, 0.3], [0.3, 0.72], [0.6, 0.6], [0.85, 0.78]]
const SUMMITS_NARROW: [number, number][] = [[0.27, 0.08], [0.73, 0.23], [0.27, 0.4], [0.73, 0.55], [0.27, 0.71], [0.73, 0.86]]
const CANVAS_WIDE = 520
// Phones get a taller, portrait canvas.
const CANVAS_NARROW = 720
const TITLE_EM = 0.7
const TRI_PX = 12
const SUMMIT_DY = TRI_PX / 2
const LEGEND_GAP = 12

const DASH: Record<MethodId, string> = { A: '7 5', B: '2 4', C: '10 4 2 4', D: '1 3.5', E: '4 3' }

interface TerrainGeometry {
  wide: boolean
  w: number
  heights: number[]
  fractions: [number, number][]
  canvasH: number
  height: number
}

function nodeHeights(width: number, m: LensModel, s: number, w: number): number[] {
  const fontPx = (width >= BREAK_TABLET ? 14 : 12.5) * s
  return m.domains.map((domain) => {
    const lines = lineCount(domain.name.toUpperCase(), w - 14, fontPx, TITLE_EM)
    return Math.max(Math.round(60 * s), Math.ceil(TRI_PX + 5 + lines * fontPx * 1.2 + 10 * s))
  })
}

function xRange(fx: number, width: number, w: number): [number, number] {
  const cx = Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, fx * width))
  return [Math.round(cx - w / 2), Math.round(cx - w / 2) + w]
}

// The canvas grows until every label sits clear of the one below it and inside the canvas.
function canvasHeight(width: number, base: number, fractions: [number, number][], heights: number[], w: number): number {
  let need = base
  fractions.forEach(([fx, fy], i) => {
    need = Math.max(need, (heights[i] + LEGEND_GAP) / (1 - fy))
    const [left, right] = xRange(fx, width, w)
    fractions.forEach(([gx, gy], j) => {
      if (gy <= fy) return
      const [otherLeft, otherRight] = xRange(gx, width, w)
      if (otherLeft < right && left < otherRight) need = Math.max(need, (heights[i] + 8) / (gy - fy))
    })
  })
  return Math.ceil(need)
}

function legendHeight(width: number, m: LensModel, s: number): number {
  const inner = width - 28
  const sentence = lineCount(LEGEND, inner, 13 * s, 0.5) * Math.ceil(20 * s)
  const keyChars = trails(m).reduce((sum, trail) => sum + trail.name.length + 2, 0)
  const keyWidth = keyChars * 11 * s * 0.68 + trails(m).length * (48 + 10)
  const keyRows = Math.max(1, Math.ceil(keyWidth / inner))
  return sentence + keyRows * Math.ceil(28 * s) + 12
}

function geometry(width: number, m: LensModel, opts?: LayoutOptions): TerrainGeometry {
  const s = scaleOf(opts)
  const wide = width >= BREAK_TABLET
  const w = wide ? 184 : 150
  const fractions = wide ? SUMMITS_WIDE : SUMMITS_NARROW
  const heights = nodeHeights(width, m, s, w)
  const canvasH = canvasHeight(width, Math.round((wide ? CANVAS_WIDE : CANVAS_NARROW) * s), fractions, heights, w)
  return { wide, w, heights, fractions, canvasH, height: canvasH + LEGEND_GAP + legendHeight(width, m, s) }
}

export function layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  const geo = geometry(stage.width, m, opts)
  return m.domains.map((domain, i) => {
    const [fx, fy] = geo.fractions[i % geo.fractions.length]
    const [x] = xRange(fx, stage.width, geo.w)
    return { domainId: domain.id, x, y: Math.round(fy * geo.canvasH), w: geo.w, h: geo.heights[i], variant: 'terrain' }
  })
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return geometry(width, m, opts).height
}

export interface Relief {
  width: number
  height: number
  summits: [number, number][]
  // exponent factor of each summit's gaussian, 1 / (2 sigma^2)
  spread: number
}

// The relief under a layout: one summit at the marker on top of each label.
export function summitsOf(nodes: NodeLayout[], width: number, m: LensModel, opts?: LayoutOptions): Relief {
  const geo = geometry(width, m, opts)
  const canvasH = geo.canvasH
  const sigma = Math.min(width, canvasH) * (geo.wide ? 0.115 : 0.15)
  return {
    width,
    height: canvasH,
    summits: nodes.map((node) => [node.x + node.w / 2, node.y + SUMMIT_DY]),
    spread: 1 / (2 * sigma * sigma),
  }
}

const GROUND = 0.1
export const PEAK = GROUND + 1

// Height at a point. Each summit is a gaussian of height 1 and the nearest one wins, so every summit
// tops out at exactly PEAK. The drifting ground swell fades to nothing at a summit, so no summit
// ever rises above another while the map drifts.
export function elevation(x: number, y: number, relief: Relief, t: number): number {
  let hill = 0
  for (const [sx, sy] of relief.summits) {
    const dx = x - sx
    const dy = y - sy
    hill = Math.max(hill, Math.exp(-(dx * dx + dy * dy) * relief.spread))
  }
  const u = x / relief.width
  const v = y / relief.height
  const swell =
    0.1 * Math.sin(u * 7 + 1.3 + t * 0.9) * Math.cos(v * 5 - 0.7 + t * 0.6) +
    0.06 * Math.sin((u * 1.7 + v) * 9 + 2 - t * 0.7) +
    0.035 * Math.cos(u * 15 + v * 4 - t)
  return GROUND + hill + swell * (1 - hill)
}

export interface Trail {
  methodId: MethodId
  name: string
  // domain indexes in model order
  path: number[]
  dash: string
}

// One trail per method that two or more areas of work share.
export function trails(m: LensModel): Trail[] {
  return m.methods
    .map((method) => ({
      methodId: method.id,
      name: method.name,
      path: m.domains.map((domain, index) => (methodsOf(m, domain.id).includes(method.id) ? index : -1)).filter((index) => index >= 0),
      dash: DASH[method.id],
    }))
    .filter((trail) => trail.path.length >= 2)
}

function trailPath(points: [number, number][], order: number): string {
  // Trails over the same pair of summits bow out to alternate sides, further for each one.
  const bend = (order % 2 ? -1 : 1) * (1 + Math.floor(order / 2) * 0.8)
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1]
    const [bx, by] = points[k]
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy) || 1
    const offset = 0.18 * length * bend * (k % 2 ? 1 : -1)
    const cx = (ax + bx) / 2 - (dy / length) * offset
    const cy = (ay + by) / 2 + (dx / length) * offset
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`
  }
  return d
}

// ---------- the canvas: drawn only in the browser ----------

const CELL = 6
const LEVELS = Array.from({ length: 17 }, (_, k) => 0.2 + k * 0.055)
const RIPPLE_MS = 1200
const RIPPLE_STAGGER = 70
const FRAME_MS = 1000 / 15
const DRIFT_STEP = 0.012
const DPR_CAP = 2

interface Live {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  relief: Relief
  dpr: number
  ripple: Animation
  t: number
  last: number
  raf: number
  onscreen: boolean
  painted: number
  frames: number
  lines: { plain: Path2D; index: Path2D } | null
  colours: { contour: string; grid: string }
  cleanup: (() => void)[]
}

let live: Live | null = null

function readColours(canvas: HTMLCanvasElement): Live['colours'] {
  const style = getComputedStyle(canvas)
  return { contour: style.getPropertyValue('--contour').trim(), grid: style.getPropertyValue('--ter-muted').trim() }
}

function buildLines(state: Live): { plain: Path2D; index: Path2D } {
  const { relief } = state
  const cols = Math.ceil(relief.width / CELL) + 1
  const rows = Math.ceil(relief.height / CELL) + 1
  const field = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) field[row * cols + col] = elevation(col * CELL, row * CELL, relief, state.t)
  }
  const plain = new Path2D()
  const index = new Path2D()
  contours(field, cols, rows, LEVELS).forEach((lines, level) => {
    const path = level % 4 === 0 ? index : plain
    for (const line of lines) {
      path.moveTo(line[0] * CELL, line[1] * CELL)
      for (let k = 2; k < line.length; k += 2) path.lineTo(line[k] * CELL, line[k + 1] * CELL)
    }
  })
  return { plain, index }
}

// The ripple's own Animation carries its progress, so the stage's delay, finish and cancel all
// steer it; a finished or cancelled ripple shows the whole map.
function rippleProgress(state: Live): number {
  const { ripple } = state
  if (ripple.playState === 'finished' || ripple.playState === 'idle') return 1
  const delay = Number(ripple.effect?.getTiming().delay ?? 0)
  return Math.min(1, Math.max(0, (Number(ripple.currentTime ?? 0) - delay) / RIPPLE_MS))
}

function paint(state: Live, progress: number): void {
  const { context, relief, dpr } = state
  state.lines ??= buildLines(state)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, relief.width, relief.height)
  context.save()
  context.strokeStyle = state.colours.grid
  context.globalAlpha = 0.28
  context.lineWidth = 1
  context.setLineDash([1, 5])
  context.beginPath()
  for (let i = 1; i < 6; i++) {
    const x = Math.round((relief.width * i) / 6) + 0.5
    context.moveTo(x, 0)
    context.lineTo(x, relief.height)
  }
  for (let j = 1; j < 4; j++) {
    const y = Math.round((relief.height * j) / 4) + 0.5
    context.moveTo(0, y)
    context.lineTo(relief.width, y)
  }
  context.stroke()
  context.restore()
  context.save()
  if (progress < 1) {
    // The map ripples out from each summit in turn.
    const elapsed = progress * RIPPLE_MS
    const speed = Math.hypot(relief.width, relief.height) / (RIPPLE_MS - RIPPLE_STAGGER * 5)
    context.beginPath()
    relief.summits.forEach(([sx, sy], k) => {
      const radius = Math.max(0, elapsed - k * RIPPLE_STAGGER) * speed
      if (radius > 0) {
        context.moveTo(sx + radius, sy)
        context.arc(sx, sy, radius, 0, Math.PI * 2)
      }
    })
    context.clip()
  }
  context.lineCap = 'round'
  context.strokeStyle = state.colours.contour
  context.globalAlpha = 0.5
  context.lineWidth = 0.8
  context.stroke(state.lines.plain)
  context.globalAlpha = 0.95
  context.lineWidth = 1.35
  context.stroke(state.lines.index)
  context.restore()
  state.painted = progress
  state.frames += 1
  state.canvas.dataset.frames = String(state.frames)
}

const drifting = (state: Live) => state.onscreen && !document.hidden && !prefersReducedMotion()

function tick(now: number): void {
  const state = live
  if (!state) return
  state.raf = 0
  const progress = rippleProgress(state)
  if (progress < 1) {
    if (progress !== state.painted) paint(state, progress)
    state.raf = requestAnimationFrame(tick)
    return
  }
  if (!drifting(state)) {
    // A still frame: hidden, off screen or reduced motion. Nothing runs until something changes.
    if (state.painted !== 1) paint(state, 1)
    return
  }
  // At most 15 frames a second on any display: the clock advances one frame period per frame.
  if (now - state.last > FRAME_MS * 4) state.last = now - FRAME_MS
  if (now - state.last >= FRAME_MS - 2) {
    state.last += FRAME_MS
    state.t += DRIFT_STEP
    state.lines = null
    paint(state, 1)
  } else if (state.painted !== 1) {
    paint(state, 1)
  }
  state.raf = requestAnimationFrame(tick)
}

function wake(): void {
  if (live && !live.raf) live.raf = requestAnimationFrame(tick)
}

function watch(state: Live): void {
  const observer = new IntersectionObserver((entries) => {
    state.onscreen = entries[entries.length - 1].isIntersecting
    wake()
  })
  observer.observe(state.canvas)
  const scheme = window.matchMedia('(prefers-color-scheme: dark)')
  const recolour = () => {
    state.colours = readColours(state.canvas)
    if (state.painted >= 0) paint(state, state.painted)
  }
  scheme.addEventListener('change', recolour)
  document.addEventListener('visibilitychange', wake)
  state.cleanup.push(
    () => observer.disconnect(),
    () => scheme.removeEventListener('change', recolour),
    () => document.removeEventListener('visibilitychange', wake),
    onReducedMotionChange(wake),
    onThemeChange(recolour),
  )
}

// Stops the loop and hands the canvas back: no backing store, out of the page.
export function release(): void {
  const state = live
  if (!state) return
  live = null
  cancelAnimationFrame(state.raf)
  for (const undo of state.cleanup) undo()
  state.canvas.width = 0
  state.canvas.height = 0
  state.canvas.remove()
}

function drawTrails(group: SVGGElement, relief: Relief, m: LensModel, height: number): (Animation | null)[] {
  const defs = svgEl('defs', {}, group)
  return trails(m).map((trail, order) => {
    const d = trailPath(trail.path.map((index) => relief.summits[index]), order)
    const id = `ter-trail-${trail.methodId}`
    const mask = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: relief.width, height }, defs)
    const reveal = svgEl('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round' }, mask)
    svgEl('path', { d, class: 'trail', 'stroke-dasharray': trail.dash, mask: `url(#${id})`, 'data-m': trail.methodId }, group)
    return drawIn(reveal, 200 + order * 160, 900)
  })
}

function drawLegend(group: SVGGElement, relief: Relief, m: LensModel): Animation {
  const block = htmlBlock(group, 14, relief.height + LEGEND_GAP, relief.width - 28, 40, 'ter-legend')
  const keys = html(
    'ul',
    'keys',
    trails(m).map((trail) => {
      const swatch = svgEl('svg', { viewBox: '0 0 30 8', width: 30, height: 8 })
      svgEl('path', { d: 'M1 4H29', class: 'trail', 'stroke-dasharray': trail.dash }, swatch)
      return html('li', '', [swatch, html('span', 'mk', [trail.methodId]), ` ${trail.name}`])
    }),
  )
  block.append(html('p', 'lt', [LEGEND]), keys)
  return fadeIn(block, 300, 400)
}

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel): Animation[] {
  release()
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  const relief = summitsOf(layouts, width, m, { rem: rootRem() })
  const group = decoGroup(svg, 'terrain')

  const canvas = document.createElement('canvas')
  canvas.className = 'ter-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.dataset.frames = '0'
  const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1)
  canvas.width = Math.round(relief.width * dpr)
  canvas.height = Math.round(relief.height * dpr)
  canvas.style.width = `${relief.width}px`
  canvas.style.height = `${relief.height}px`
  // The context is taken before the canvas joins the page, so a failure never leaves it behind.
  const context = canvas.getContext('2d')
  if (!context) throw new Error('terrain: 2d canvas context is unavailable')
  svg.before(canvas)
  const ripple = canvas.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1 }], { duration: RIPPLE_MS, easing: 'linear', fill: 'backwards' })

  const state: Live = {
    canvas, context, relief, dpr, ripple,
    t: 0, last: -Infinity, raf: 0, onscreen: true, painted: -1, frames: 0, lines: null,
    colours: readColours(canvas), cleanup: [],
  }
  live = state
  watch(state)
  wake()
  return [ripple, ...drawTrails(group, relief, m, height), drawLegend(group, relief, m)].filter(present)
}
