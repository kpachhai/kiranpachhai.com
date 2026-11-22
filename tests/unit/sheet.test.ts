import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { buildIslandData, type IslandData } from '../../src/island/data'
import { sourceLabel } from '../../src/lib/provenance'
import { upstream } from '../../src/lib/site'
import { contours } from '../../src/lib/contours'
import {
  CELL,
  LAYOUTS,
  contourLines,
  heightField,
  methodsOfDomain,
  scheduleCells,
  sheetTrails,
  spots,
} from '../../src/lib/sheet'

const data = buildIslandData(model, (source) => sourceLabel(source), upstream)
const layouts = Object.values(LAYOUTS)

// Absolute points from a path of one M and relative l pairs, the form contourLines writes.
function decodePath(d: string): [number, number][] {
  const match = /^M(-?\d+) (-?\d+)(?:l(.*))?$/.exec(d)
  if (!match) throw new Error(`unexpected contour path: ${d.slice(0, 40)}`)
  const points: [number, number][] = [[Number(match[1]), Number(match[2])]]
  const deltas = (match[3]?.match(/-?\d+/g) ?? []).map(Number)
  for (let k = 0; k < deltas.length; k += 2) {
    const [x, y] = points[points.length - 1]
    points.push([x + deltas[k], y + deltas[k + 1]])
  }
  return points
}

function distanceToSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distanceToPolyline(point: [number, number], points: [number, number][]): number {
  if (points.length === 1) return Math.hypot(point[0] - points[0][0], point[1] - points[0][1])
  let best = Infinity
  for (let k = 1; k < points.length; k++) best = Math.min(best, distanceToSegment(point, points[k - 1], points[k]))
  return best
}

// The start point and the first quadratic segment of a trail path, read by command name: M x y,
// then Q cx cy bx by. Returns [ax, ay, cx, cy, bx, by].
function firstSegment(d: string): number[] {
  const number = '(-?\\d+(?:\\.\\d+)?)'
  const start = new RegExp(`^M${number} ${number}`).exec(d)
  const curve = new RegExp(`Q${number} ${number} ${number} ${number}`).exec(d)
  if (!start || !curve) throw new Error(`trail path has no M then Q: ${d.slice(0, 40)}`)
  return [...start.slice(1, 3), ...curve.slice(1, 5)].map(Number)
}

// Label box (width, height) per shape, sized so 200 % text still fits.
const LABEL_BOX = { wide: [240, 96], tall: [176, 112] } as const

// The name and meta lines under each peak, in viewBox units, as measured in the browser with default
// text: their width, their top below the summit point at the largest scale each drawing is shown,
// and their bottom at the smallest (wide at 861 px, tall at 320 px). The peak reaches PEAK above.
const NAME_BOX = { wide: { width: 240, top: 35, bottom: 192 }, tall: { width: 150, top: 22, bottom: 141 } } as const
const PEAK = 10

describe('sheet layouts', () => {
  for (const layout of layouts) {
    it(`${layout.shape}: one summit per domain, inside the viewBox with a 10 % margin`, () => {
      expect(layout.summits).toHaveLength(data.domains.length)
      for (const [x, y] of layout.summits) {
        expect(x).toBeGreaterThanOrEqual(layout.width * 0.1)
        expect(x).toBeLessThanOrEqual(layout.width * 0.9)
        expect(y).toBeGreaterThanOrEqual(layout.height * 0.1)
        expect(y).toBeLessThanOrEqual(layout.height * 0.9)
      }
    })

    it(`${layout.shape}: labels never overlap`, () => {
      const [labelWidth, labelHeight] = LABEL_BOX[layout.shape]
      layout.summits.forEach(([ax, ay], i) => {
        layout.summits.slice(i + 1).forEach(([bx, by]) => {
          const sharesX = Math.abs(ax - bx) < labelWidth
          if (sharesX) expect(Math.abs(ay - by)).toBeGreaterThanOrEqual(labelHeight)
        })
      })
    })
  }

  // The wide drawing fills a desktop cell whose shape changes with the width, so its field runs past
  // the 880 x 800 core the summits sit in; the page crops the field, never stretches it. The tall
  // drawing stops growing at 560 px across its 360-unit core, so its field runs past the core in
  // width to cover a tablet cell up to 860 px.
  it('wide is an 880 x 1500 field around an 880 x 800 core, and tall is a 540 x 1000 field around a 360 x 1000 core', () => {
    expect([LAYOUTS.wide.width, LAYOUTS.wide.height, LAYOUTS.wide.coreWidth, LAYOUTS.wide.core]).toEqual([880, 1500, 880, 800])
    expect([LAYOUTS.tall.width, LAYOUTS.tall.height, LAYOUTS.tall.coreWidth, LAYOUTS.tall.core]).toEqual([540, 1000, 360, 1000])
    const top = (LAYOUTS.wide.height - LAYOUTS.wide.core) / 2
    for (const [, y] of LAYOUTS.wide.summits) {
      expect(y).toBeGreaterThanOrEqual(top + LAYOUTS.wide.core * 0.1)
      expect(y).toBeLessThanOrEqual(top + LAYOUTS.wide.core * 0.9)
    }
    const left = (LAYOUTS.tall.width - LAYOUTS.tall.coreWidth) / 2
    for (const [x] of LAYOUTS.tall.summits) {
      expect(x).toBeGreaterThanOrEqual(left + LAYOUTS.tall.coreWidth * 0.1)
      expect(x).toBeLessThanOrEqual(left + LAYOUTS.tall.coreWidth * 0.9)
    }
  })

  // On a phone the two zigzag columns sit further apart than a label is wide, so labels only stack
  // within a column, where summits are two rows apart: room for labels at 200 % text.
  it('tall: the zigzag columns are further apart than the 150-unit drawn label', () => {
    const columns = [...new Set(LAYOUTS.tall.summits.map(([x]) => x))].sort((a, b) => a - b)
    expect(columns).toHaveLength(2)
    expect(columns[1] - columns[0]).toBeGreaterThan(150)
  })
})

describe('contourLines', () => {
  for (const layout of layouts) {
    it(`${layout.shape}: every summit has the same height`, () => {
      const { values, cols } = heightField(layout)
      const heights = layout.summits.map(([x, y]) => values[Math.round(y / CELL) * cols + Math.round(x / CELL)])
      // Sampled at the nearest grid node, at most half a cell (3 units) off the summit in x and in y.
      // There the summit's own gaussian is at least exp(-18 * spread): 0.99917 on the wide sheet
      // (sigma 104) and 0.99827 on the tall (sigma 72). A node's height is hill + ridge * (1 - hill),
      // and the ridges sum to at most 0.275 each (22 wide, 13 tall), so two summits' sampled heights
      // differ by at most (1 - hill) * that sum: 0.0050 wide, 0.0062 tall. 0.02 holds with room; the
      // heights measured differ by 0.0002 and 0.0004.
      for (const height of heights) expect(Math.abs(height - heights[0])).toBeLessThan(0.02)
    })

    it(`${layout.shape}: deterministic, whole-number coordinates`, () => {
      const first = contourLines(layout)
      expect(first.length).toBeGreaterThan(0)
      expect(contourLines(layout)).toEqual(first)
      for (const line of first) expect(line.d).not.toMatch(/\d\.\d/)
    })

    it(`${layout.shape}: every fourth contour level is an index contour`, () => {
      const field = heightField(layout)
      const perLevel = contours(field.values, field.cols, field.rows, field.levels).map((lines) => lines.length)
      expect(perLevel).toHaveLength(13)
      const expected = perLevel.flatMap((count, level) => Array<boolean>(count).fill(level % 4 === 0))
      expect(contourLines(layout).map((line) => line.index)).toEqual(expected)
      expect([0, 4, 8, 12].every((level) => perLevel[level] > 0)).toBe(true)
    })

    // The intro draws the contours outward from the summits, a level at a time.
    it(`${layout.shape}: each contour line carries its level, lowest first`, () => {
      const field = heightField(layout)
      const perLevel = contours(field.values, field.cols, field.rows, field.levels).map((lines) => lines.length)
      const expected = perLevel.flatMap((count, level) => Array<number>(count).fill(level))
      expect(contourLines(layout).map((line) => line.level)).toEqual(expected)
    })
  }

  // Both drawings are inlined in the home page, which has a 40 KB gzip budget.
  it('the contour paths of both drawings stay under 14 KB gzip together', () => {
    const markup = layouts.flatMap((layout) => contourLines(layout).map((line) => `<path class="contour" d="${line.d}"/>`)).join('')
    expect(gzipSync(markup, { level: 9 }).length).toBeLessThan(14_000)
  })

  for (const layout of layouts) {
    it(`${layout.shape}: a compacted contour stays within 1.5 units of the traced line`, () => {
      const field = heightField(layout)
      const traced = contours(field.values, field.cols, field.rows, field.levels).flat()
      const drawn = contourLines(layout)
      expect(drawn).toHaveLength(traced.length)
      drawn.forEach((line, position) => {
        const points = decodePath(line.d)
        const raw = traced[position]
        for (let k = 0; k < raw.length; k += 2) {
          const distance = distanceToPolyline([raw[k] * CELL, raw[k + 1] * CELL], points)
          expect(distance, `${layout.shape} line ${position} point ${k / 2}`).toBeLessThanOrEqual(1.5)
        }
      })
    })
  }

  it('samples on a 6 unit cell', () => {
    expect(CELL).toBe(6)
  })
})

describe('methods and trails', () => {
  const shared = data.methods
    .map((method) => ({
      id: method.id,
      areas: data.domains.filter((domain) => data.proofs.some((proof) => proof.domainId === domain.id && proof.methods.includes(method.id))).map((d) => d.id),
    }))
    .filter((entry) => entry.areas.length >= 2)

  // The proofs here name their methods out of rev order (D before A, then B), so only an output
  // sorted by rev, not by first appearance, reads A, B, D.
  it('methodsOfDomain lists a domain\'s methods in rev order, whatever order the proofs name them in', () => {
    const [first, second] = data.proofs
    const shuffled: IslandData = {
      ...data,
      proofs: [
        { ...first, domainId: 'agents', methods: ['D', 'A'] },
        { ...second, domainId: 'agents', methods: ['B', 'D'] },
      ],
    }
    expect(methodsOfDomain(shuffled, 'agents')).toEqual(['A', 'B', 'D'])
    expect(methodsOfDomain(data, 'agents')).toEqual(['A', 'B', 'D'])
    expect(methodsOfDomain(data, 'protocol')).toEqual([])
  })

  for (const layout of layouts) {
    it(`${layout.shape}: trails are exactly the methods two or more areas share, chained in model order`, () => {
      const trails = sheetTrails(data, layout)
      expect(trails.map((trail) => trail.methodId)).toEqual(shared.map((entry) => entry.id))
      expect(trails.map((trail) => trail.areas)).toEqual(shared.map((entry) => entry.areas))
      expect(shared.map((entry) => entry.id)).toEqual(['A', 'B', 'D'])
    })

    it(`${layout.shape}: no two trails share a path`, () => {
      const trails = sheetTrails(data, layout)
      expect(trails.map((trail) => trail.methodId)).toEqual(['A', 'B', 'D'])
      trails.forEach((trail, position) => {
        for (const other of trails.slice(position + 1)) expect(trail.d, `${trail.methodId} and ${other.methodId}`).not.toBe(other.d)
      })
    })

    it(`${layout.shape}: a trail's tag sits on the first segment's curve at t = 0.5`, () => {
      for (const trail of sheetTrails(data, layout)) {
        const [ax, ay, cx, cy, bx, by] = firstSegment(trail.d)
        expect(Math.abs(trail.tag[0] - (ax + 2 * cx + bx) / 4)).toBeLessThanOrEqual(1)
        expect(Math.abs(trail.tag[1] - (ay + 2 * cy + by) / 4)).toBeLessThanOrEqual(1)
      }
    })

    // A trail runs from summit point to summit point, where the peak markers sit, through every
    // area it connects in model order.
    it(`${layout.shape}: a trail starts, bends and ends on the summit points of its areas`, () => {
      for (const trail of sheetTrails(data, layout)) {
        const numbers = (trail.d.match(/-?\d+/g) ?? []).map(Number)
        const ends: [number, number][] = [[numbers[0], numbers[1]]]
        for (let k = 4; k + 1 < numbers.length; k += 4) ends.push([numbers[k], numbers[k + 1]])
        const summits = trail.areas.map((id) => layout.summits[data.domains.findIndex((domain) => domain.id === id)])
        expect(ends, trail.methodId).toEqual(summits)
      }
    })

    // The name and meta lines hang under each peak. A trail crossing them would strike a label
    // through; one crossing any part of an area it does not connect would read as that area using
    // the method.
    it(`${layout.shape}: no trail crosses a summit's name or meta lines, and no trail or tag crosses an area it does not connect`, () => {
      const { width, top, bottom } = NAME_BOX[layout.shape]
      const inBox = ([px, py]: [number, number], [sx, sy]: [number, number], from: number) => Math.abs(px - sx) < width / 2 && py > sy + from && py < sy + bottom
      for (const trail of sheetTrails(data, layout)) {
        const numbers = (trail.d.match(/-?\d+/g) ?? []).map(Number)
        const points: [number, number][] = []
        for (let k = 2; k + 3 < numbers.length; k += 4) {
          const [ax, ay] = k === 2 ? [numbers[0], numbers[1]] : [numbers[k - 2], numbers[k - 1]]
          const [cx, cy, bx, by] = numbers.slice(k, k + 4)
          for (let step = 0; step <= 100; step++) {
            const t = step / 100
            points.push([(1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by])
          }
        }
        data.domains.forEach((domain, position) => {
          const connected = trail.areas.includes(domain.id)
          const summit = layout.summits[position]
          const crossing = (connected ? points : [...points, trail.tag]).filter((point) => inBox(point, summit, connected ? top : -PEAK))
          expect(crossing, `${trail.methodId} crosses ${domain.id}`).toEqual([])
        })
      }
    })

    // Trails between the same two summits stay apart, so three of them read as three, not as one
    // heavy line.
    it(`${layout.shape}: trails over the same pair of summits are at least 10 units apart at their middles`, () => {
      const curves = sheetTrails(data, layout).flatMap((trail) => {
        const numbers = (trail.d.match(/-?\d+/g) ?? []).map(Number)
        const out: { trail: string; pair: string; points: [number, number][] }[] = []
        for (let k = 2; k + 3 < numbers.length; k += 4) {
          const [ax, ay] = [numbers[k - 2], numbers[k - 1]]
          const [cx, cy, bx, by] = numbers.slice(k, k + 4)
          const points: [number, number][] = []
          for (let step = 0; step <= 100; step++) {
            const t = step / 100
            points.push([(1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by])
          }
          out.push({ trail: trail.methodId, pair: [`${ax},${ay}`, `${bx},${by}`].sort().join(' '), points })
        }
        return out
      })
      for (const curve of curves) {
        for (const other of curves.filter((item) => item.pair === curve.pair && item.trail !== curve.trail)) {
          const [mx, my] = curve.points[50]
          const nearest = Math.min(...other.points.map(([px, py]) => Math.hypot(px - mx, py - my)))
          expect(nearest, `${curve.trail} and ${other.trail} over ${curve.pair}`).toBeGreaterThanOrEqual(10)
        }
      }
    })

    it(`${layout.shape}: trail paths use whole numbers`, () => {
      for (const trail of sheetTrails(data, layout)) expect(trail.d).not.toMatch(/\d\.\d/)
    })
  }

  it('spots are the methods exactly one area uses', () => {
    expect(spots(data)).toEqual([
      { methodId: 'C', domainId: 'explainers' },
      { methodId: 'E', domainId: 'explainers' },
    ])
  })
})

describe('scheduleCells', () => {
  it('covers every domain by every mode, and counts match model.range', () => {
    const cells = scheduleCells(data)
    expect(cells).toHaveLength(24)
    for (const cell of cells) {
      const range = data.range.find((entry) => entry.domainId === cell.domainId && entry.mode === cell.mode)
      expect(cell.count).toBe(range ? range.proofIds.length : 0)
    }
  })
})
