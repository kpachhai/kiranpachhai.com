// Geometry of the home page's site-plan sheet: summit positions, contour lines, trails between
// summits, and the method and schedule tables. Pure and DOM-free; the page renders it at build time.
import type { IslandData } from '../island/data'
import type { DomainId, MethodId, ModeId } from '../model/schema'
import { contours } from './contours'

export type SheetShape = 'wide' | 'tall'

export interface LabelBox {
  width: number
  top: number
  bottom: number
}

export interface SheetLayout {
  shape: SheetShape
  width: number
  height: number
  // height and width of the band the summits sit in, centred in the viewBox; the rest is ground the
  // page may crop. The wide field runs past its core in height so a desktop cell of any shape can be
  // covered at one scale, and the tall field runs past its core in width so a tablet cell wider than
  // the capped drawing is covered too.
  core: number
  coreWidth: number
  // viewBox coordinates, one per domain in model order
  summits: [number, number][]
  // exponent factor of each summit's gaussian, 1 / (2 sigma^2)
  spread: number
  // the name and meta lines that hang under each peak marker, in viewBox units at the smallest
  // scale the drawing is shown with default text: their width, and how far below the summit point
  // they start and end. Trails keep out of them.
  label: LabelBox
  // low ridges spread over the field, so ground away from the summits is not flat
  ridges: number
}

// Summits sit far enough apart that two labels in the same column clear each other vertically, so a
// label can grow downwards with larger text. Fractions of the core, in model order. On the wide sheet
// Wallets sits up and left of Agents, which keeps to the right edge, so the trails from Agents down to
// Explainers have room to pass between their labels. The tall zigzag's columns are further apart
// than a drawn label is wide, so its labels only stack within a column.
const WIDE_FRACTIONS: [number, number][] = [[0.17, 0.25], [0.46, 0.1], [0.84, 0.3], [0.25, 0.64], [0.54, 0.6], [0.84, 0.72]]
const TALL_FRACTIONS: [number, number][] = [[0.28, 0.12], [0.72, 0.25], [0.28, 0.38], [0.72, 0.52], [0.28, 0.66], [0.72, 0.8]]

interface LayoutSpec {
  width: number
  height: number
  core: number
  coreWidth: number
  fractions: [number, number][]
  sigmaShare: number
  label: LabelBox
  ridges: number
}

function buildLayout(shape: SheetShape, spec: LayoutSpec): SheetLayout {
  const { width, height, core, coreWidth, fractions, sigmaShare, label, ridges } = spec
  const sigma = Math.min(coreWidth, core) * sigmaShare
  const top = (height - core) / 2
  const left = (width - coreWidth) / 2
  return {
    shape,
    width,
    height,
    core,
    coreWidth,
    summits: fractions.map(([fx, fy]) => [Math.round(left + fx * coreWidth), Math.round(top + fy * core)]),
    spread: 1 / (2 * sigma * sigma),
    label,
    ridges,
  }
}

export const LAYOUTS: Record<SheetShape, SheetLayout> = {
  wide: buildLayout('wide', { width: 880, height: 1500, core: 800, coreWidth: 880, fractions: WIDE_FRACTIONS, sigmaShare: 0.13, label: { width: 240, top: 30, bottom: 200 }, ridges: 22 }),
  tall: buildLayout('tall', { width: 540, height: 1000, core: 1000, coreWidth: 360, fractions: TALL_FRACTIONS, sigmaShare: 0.2, label: { width: 150, top: 18, bottom: 146 }, ridges: 13 }),
}

export const CELL = 6
const LEVEL_START = 0.12
const LEVEL_STEP = 0.07
const LEVEL_COUNT = 13
const RIDGE_SEED = 7

export interface HeightField {
  values: Float32Array
  cols: number
  rows: number
  levels: number[]
}

// Park-Miller, so the ridges are the same on every build.
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

// [x, y, height, sigma] of each low ridge.
function ridges(layout: SheetLayout): [number, number, number, number][] {
  const random = seededRandom(RIDGE_SEED)
  const sigma = Math.sqrt(1 / (2 * layout.spread))
  return Array.from({ length: layout.ridges }, () => [random() * layout.width, random() * layout.height, 0.25 + random() * 0.3, sigma * (0.6 + random() * 0.8)])
}

// The nearest summit's gaussian keeps every summit equal in height. The ridges fade to nothing
// under a summit (the 1 - hill factor), so they only add low ground and never lift one summit above another.
export function heightField(layout: SheetLayout): HeightField {
  const cols = Math.ceil(layout.width / CELL) + 1
  const rows = Math.ceil(layout.height / CELL) + 1
  const lumps = ridges(layout)
  const values = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * CELL
      const y = row * CELL
      let hill = 0
      for (const [sx, sy] of layout.summits) hill = Math.max(hill, Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) * layout.spread))
      let ridge = 0
      for (const [lx, ly, lump, sigma] of lumps) ridge += lump * 0.5 * Math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / (2 * sigma * sigma))
      values[row * cols + col] = hill + ridge * (1 - hill)
    }
  }
  return { values, cols, rows, levels: Array.from({ length: LEVEL_COUNT }, (_, level) => LEVEL_START + level * LEVEL_STEP) }
}

export interface ContourLine {
  d: string
  index: boolean
  level: number
}

// How far, in viewBox units, a dropped point may sit from the simplified line. Rounding adds at
// most another 0.71, so a drawn contour stays within 1.5 units of the traced one.
const SIMPLIFY_TOLERANCE = 0.7

function offLine([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Ramer-Douglas-Peucker on whole-unit points: keeps the ends, and any point further than the
// tolerance from the chord between the points kept around it. Iterative, so long rings cannot
// overflow the stack.
function simplify(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const spans: [number, number][] = [[0, points.length - 1]]
  while (spans.length > 0) {
    const [first, last] = spans.pop()!
    let furthest = -1
    let furthestDistance = SIMPLIFY_TOLERANCE
    for (let k = first + 1; k < last; k++) {
      const distance = offLine(points[k], points[first], points[last])
      if (distance > furthestDistance) {
        furthest = k
        furthestDistance = distance
      }
    }
    if (furthest < 0) continue
    keep[furthest] = 1
    spans.push([first, furthest], [furthest, last])
  }
  return points.filter((_, k) => keep[k] === 1)
}

// One absolute M, then relative l pairs: short deltas between whole-unit points are what keep the
// two inline drawings inside the home page's HTML budget. A minus sign separates numbers by itself.
function linePath(line: number[]): string {
  const rounded: [number, number][] = []
  for (let k = 0; k < line.length; k += 2) {
    const point: [number, number] = [Math.round(line[k] * CELL), Math.round(line[k + 1] * CELL)]
    const previous = rounded[rounded.length - 1]
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) rounded.push(point)
  }
  const points = simplify(rounded)
  let d = `M${points[0][0]} ${points[0][1]}`
  if (points.length > 1) d += 'l'
  for (let k = 1; k < points.length; k++) {
    for (const delta of [points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]]) {
      d += d.endsWith('l') || delta < 0 ? `${delta}` : ` ${delta}`
    }
  }
  return d
}

// Every fourth level is an index contour, drawn heavier. Levels count up from the lowest ground.
export function contourLines(layout: SheetLayout): ContourLine[] {
  const field = heightField(layout)
  return contours(field.values, field.cols, field.rows, field.levels).flatMap((lines, level) =>
    lines.map((line) => ({ d: linePath(line), index: level % 4 === 0, level })),
  )
}

export function methodsOfDomain(m: IslandData, domainId: DomainId): MethodId[] {
  const used = new Set(m.proofs.filter((proof) => proof.domainId === domainId).flatMap((proof) => proof.methods))
  return m.methods.map((method) => method.id).filter((id) => used.has(id))
}

export interface SheetTrail {
  methodId: MethodId
  name: string
  areas: DomainId[]
  d: string
  tag: [number, number]
}

type Point = [number, number]

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

// A drawn segment of a trail: the two summits it joins, its control point, points along it, and
// the middle of its curve.
interface Segment {
  pair: string
  control: Point
  samples: Point[]
  middle: Point
}

// How far above the summit point the peak marker reaches, in viewBox units, at the smallest scale.
const PEAK_REACH = 12
// A trail keeps this far inside the core's edge.
const CORE_MARGIN = 10
// A tag's ring radius at the smallest scale, in viewBox units, so the whole ring keeps off a label.
const TAG_RADIUS = 16
// Two trails between the same two summits keep at least this far apart at the middle of the curve,
// in viewBox units, so they read as two trails rather than one heavy one.
const TRAIL_GAP = 10

function curvePoint([ax, ay]: Point, [cx, cy]: Point, [bx, by]: Point, t: number): Point {
  return [(1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by]
}

// The midpoint of a segment's curve (a quadratic Bezier at t = 0.5), where the circled letter sits
// on a trail's first segment.
function midpoint(a: Point, control: Point, b: Point): Point {
  return [Math.round((a[0] + 2 * control[0] + b[0]) / 4), Math.round((a[1] + 2 * control[1] + b[1]) / 4)]
}

// Points every few units along a segment's curve, ends included.
function curveSamples(a: Point, control: Point, b: Point): Point[] {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4)
  return Array.from({ length: steps + 1 }, (_, step) => curvePoint(a, control, b, step / steps))
}

// Control points to try for a segment, gentlest first: a point part way along the chord, pushed off
// it to either side by a share of the chord's length. Whole units, as drawn.
function candidateControls([ax, ay]: Point, [bx, by]: Point): Point[] {
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy) || 1
  const candidates: { control: Point; cost: number }[] = []
  for (let along = 0; along <= 40; along++) {
    for (let aside = -60; aside <= 60; aside++) {
      const u = along / 40
      const v = aside / 50
      candidates.push({
        control: [Math.round(ax + u * dx - v * dy), Math.round(ay + u * dy + v * dx)],
        cost: Math.abs(v) + 0.3 * Math.abs(u - 0.5),
      })
    }
  }
  return candidates.sort((first, second) => first.cost - second.cost).map(({ control }) => control)
}

// The ground a trail keeps out of. Under a summit the trail connects it may cross the peak and the
// number disc but not the name and meta lines; any other summit's whole label is out of bounds.
function labelBoxes(layout: SheetLayout, connected: number[]): Box[] {
  const { width, top, bottom } = layout.label
  return layout.summits.map(([sx, sy], position) => ({
    left: sx - width / 2,
    right: sx + width / 2,
    top: sy + (connected.includes(position) ? top : -PEAK_REACH),
    bottom: sy + bottom,
  }))
}

function inside([px, py]: Point, box: Box, margin = 0): boolean {
  return px > box.left - margin && px < box.right + margin && py > box.top - margin && py < box.bottom + margin
}

// The core the summits sit in: every width shows all of it, so a trail stays inside.
function coreBox(layout: SheetLayout): Box {
  const left = (layout.width - layout.coreWidth) / 2 + CORE_MARGIN
  const top = (layout.height - layout.core) / 2 + CORE_MARGIN
  return { left, right: layout.width - left, top, bottom: layout.height - top }
}

interface Route {
  layout: SheetLayout
  boxes: Box[]
  drawn: Segment[]
  tags: Point[]
}

function segmentOf(pair: string, a: Point, control: Point, b: Point): Segment {
  return { pair, control, samples: curveSamples(a, control, b), middle: curvePoint(a, control, b, 0.5) }
}

// True when either curve's middle comes within TRAIL_GAP of the other curve.
function retraces(segment: Segment, other: Segment): boolean {
  const close = (points: Point[], [mx, my]: Point) => points.some(([px, py]) => Math.hypot(px - mx, py - my) < TRAIL_GAP)
  return segment.pair === other.pair && (close(other.samples, segment.middle) || close(segment.samples, other.middle))
}

// The gentlest segment whose curve keeps inside the core and out of every label box, which does
// not retrace a segment already drawn over the same pair of summits, and, on a trail's first
// segment, whose tag ring keeps off the labels and the tags already placed.
function routeSegment(route: Route, a: Point, b: Point, pair: string, first: boolean): Segment {
  const core = coreBox(route.layout)
  const tagFits = (tag: Point) =>
    !route.boxes.some((box) => inside(tag, box, TAG_RADIUS)) && !route.tags.some((other) => Math.hypot(other[0] - tag[0], other[1] - tag[1]) < 2 * TAG_RADIUS + 4)
  const fits = (control: Point) => {
    if (first && !tagFits(midpoint(a, control, b))) return false
    const segment = segmentOf(pair, a, control, b)
    if (route.drawn.some((other) => retraces(segment, other))) return false
    return segment.samples.every((point) => inside(point, core) && !route.boxes.some((box) => inside(point, box)))
  }
  const control = candidateControls(a, b).find(fits)
  if (!control) throw new Error(`sheetTrails: no route for segment ${pair} on the ${route.layout.shape} sheet keeps clear of the labels`)
  return segmentOf(pair, a, control, b)
}

function domainsUsing(m: IslandData, methodId: MethodId): DomainId[] {
  return m.domains.filter((domain) => methodsOfDomain(m, domain.id).includes(methodId)).map((domain) => domain.id)
}

// One trail per method that two or more areas share, chained through the areas' peaks in model order.
export function sheetTrails(m: IslandData, layout: SheetLayout): SheetTrail[] {
  const drawn: Segment[] = []
  const tags: Point[] = []
  return m.methods
    .map((method) => ({ method, areas: domainsUsing(m, method.id) }))
    .filter(({ areas }) => areas.length >= 2)
    .map(({ method, areas }) => {
      const indices = areas.map((id) => m.domains.findIndex((domain) => domain.id === id))
      const points = indices.map((index) => layout.summits[index])
      const route: Route = { layout, boxes: labelBoxes(layout, indices), drawn, tags }
      const segments = points.slice(1).map((point, k) => {
        const pair = [indices[k], indices[k + 1]].sort((first, second) => first - second).join('-')
        return routeSegment(route, points[k], point, pair, k === 0)
      })
      drawn.push(...segments)
      const tag = midpoint(points[0], segments[0].control, points[1])
      tags.push(tag)
      const d = segments.reduce((path, { control }, k) => `${path} Q${control[0]} ${control[1]} ${points[k + 1][0]} ${points[k + 1][1]}`, `M${points[0][0]} ${points[0][1]}`)
      return { methodId: method.id, name: method.name, areas, d, tag }
    })
}

// Methods exactly one area uses: they have no trail, so the sheet marks them on their summit.
export function spots(m: IslandData): { methodId: MethodId; domainId: DomainId }[] {
  return m.methods.flatMap((method) => {
    const areas = domainsUsing(m, method.id)
    return areas.length === 1 ? [{ methodId: method.id, domainId: areas[0] }] : []
  })
}

export interface ScheduleCell {
  domainId: DomainId
  mode: ModeId
  count: number
}

export function scheduleCells(m: IslandData): ScheduleCell[] {
  return m.domains.flatMap((domain) =>
    m.modes.map((mode) => {
      const cell = m.range.find((entry) => entry.domainId === domain.id && entry.mode === mode.id)
      return { domainId: domain.id, mode: mode.id, count: cell ? cell.proofIds.length : 0 }
    }),
  )
}
