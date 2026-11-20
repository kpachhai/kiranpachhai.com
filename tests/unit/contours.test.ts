import { describe, expect, it } from 'vitest'
import { contours } from '../../src/island/lenses/contours'

// A single gaussian centred on a square grid: every level below the peak is one closed ring.
function gaussian(size: number, sigma: number): Float32Array {
  const field = new Float32Array(size * size)
  const centre = (size - 1) / 2
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const dx = col - centre
      const dy = row - centre
      field[row * size + col] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
    }
  }
  return field
}

function points(line: number[]): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k < line.length; k += 2) out.push([line[k], line[k + 1]])
  return out
}

describe('contours()', () => {
  const size = 41
  const sigma = 6
  const centre = (size - 1) / 2
  const levels = [0.2, 0.4, 0.6, 0.8]

  it('a single gaussian yields one closed ring per level, concentric and shrinking as the level rises', () => {
    const rings = contours(gaussian(size, sigma), size, size, levels)
    expect(rings).toHaveLength(levels.length)
    let lastRadius = Infinity
    levels.forEach((level, index) => {
      const lines = rings[index]
      expect(lines, `level ${level}`).toHaveLength(1)
      const ring = points(lines[0])
      expect(ring.length, `level ${level}`).toBeGreaterThan(8)
      // closed: the polyline ends where it starts
      expect(ring[ring.length - 1][0]).toBeCloseTo(ring[0][0], 9)
      expect(ring[ring.length - 1][1]).toBeCloseTo(ring[0][1], 9)
      // concentric: every point sits near the analytic radius of that level around the centre
      const expected = sigma * Math.sqrt(-2 * Math.log(level))
      for (const [x, y] of ring) expect(Math.abs(Math.hypot(x - centre, y - centre) - expected), `level ${level}`).toBeLessThan(0.35)
      expect(expected).toBeLessThan(lastRadius)
      lastRadius = expected
    })
  })

  it('returns no line for a level above the peak, and an open edge-to-edge line for a ramp', () => {
    expect(contours(gaussian(size, sigma), size, size, [1.5])).toEqual([[]])
    const w = 10
    const h = 6
    const ramp = new Float32Array(w * h)
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) ramp[row * w + col] = col
    const [lines] = contours(ramp, w, h, [4.5])
    expect(lines).toHaveLength(1)
    const line = points(lines[0])
    expect(line).toHaveLength(h)
    for (const [x] of line) expect(x).toBeCloseTo(4.5, 9)
    expect(line[0][1]).not.toBe(line[line.length - 1][1])
  })

  it('is pure: the field is left untouched and the same input gives the same lines', () => {
    const field = gaussian(size, sigma)
    const copy = Float32Array.from(field)
    const first = contours(field, size, size, levels)
    expect(field).toEqual(copy)
    expect(contours(field, size, size, levels)).toEqual(first)
  })

  it('resolves a saddle cell by its centre value', () => {
    // tl 0, tr 1, bl 1, br 0: the centre is 0.5
    const saddle = Float32Array.from([0, 1, 1, 0])
    const lines = (level: number) =>
      contours(saddle, 2, 2, [level])[0]
        .map((line) => points(line).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).sort().join(' '))
        .sort()
    // above the centre the high corners (tr, bl) are cut off; below it the low corners (tl, br) are
    expect(lines(0.6)).toEqual(['0.0,0.6 0.4,1.0', '0.6,0.0 1.0,0.4'])
    expect(lines(0.4)).toEqual(['0.0,0.4 0.4,0.0', '0.6,1.0 1.0,0.6'])
  })

  it('rejects a field whose length does not match the grid', () => {
    expect(() => contours(new Float32Array(10), 4, 4, [0.5])).toThrow()
  })
})
