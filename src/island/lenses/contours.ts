// Marching squares over a sampled height field, stitched into polylines. Pure: no DOM, no state.
// The field is w columns by h rows, row-major. The result has one entry per level; each entry is a
// list of polylines as flat [x0, y0, x1, y1, ...] in sample units. A closed ring repeats its first
// point at the end; a line that meets the grid edge stays open.

// Each crossing sits on one grid edge, and an edge is shared by at most two cells, so a crossing
// joins at most two segments. Edge ids: horizontal edges first, then vertical edges.
function crossingPoint(field: Float32Array, w: number, h: number, level: number, edge: number): [number, number] {
  const horizontal = (w - 1) * h
  if (edge < horizontal) {
    const row = Math.floor(edge / (w - 1))
    const col = edge - row * (w - 1)
    const a = field[row * w + col]
    const b = field[row * w + col + 1]
    return [col + (level - a) / (b - a), row]
  }
  const id = edge - horizontal
  const row = Math.floor(id / w)
  const col = id - row * w
  const a = field[row * w + col]
  const b = field[(row + 1) * w + col]
  return [col, row + (level - a) / (b - a)]
}

// Segments for one level as pairs of edge ids.
function segmentsAt(field: Float32Array, w: number, h: number, level: number): number[] {
  const horizontal = (w - 1) * h
  const out: number[] = []
  for (let row = 0; row < h - 1; row++) {
    for (let col = 0; col < w - 1; col++) {
      const tl = field[row * w + col]
      const tr = field[row * w + col + 1]
      const br = field[(row + 1) * w + col + 1]
      const bl = field[(row + 1) * w + col]
      const index = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0)
      if (index === 0 || index === 15) continue
      const top = row * (w - 1) + col
      const bottom = (row + 1) * (w - 1) + col
      const left = horizontal + row * w + col
      const right = left + 1
      switch (index) {
        case 1: case 14: out.push(left, bottom); break
        case 2: case 13: out.push(bottom, right); break
        case 3: case 12: out.push(left, right); break
        case 4: case 11: out.push(top, right); break
        case 6: case 9: out.push(top, bottom); break
        case 7: case 8: out.push(left, top); break
        default: {
          // Saddle (5: tr and bl high; 10: tl and br high). The cell centre decides which diagonal
          // pair joins through the middle; the other pair is cut off at its two corners.
          const centreHigh = (tl + tr + br + bl) / 4 > level
          const isolatesTlBr = (index === 5) === centreHigh
          if (isolatesTlBr) out.push(left, top, bottom, right)
          else out.push(top, right, left, bottom)
        }
      }
    }
  }
  return out
}

function stitch(field: Float32Array, w: number, h: number, level: number, segments: number[]): number[][] {
  const count = segments.length / 2
  const atEdge = new Map<number, number[]>()
  for (let seg = 0; seg < count; seg++) {
    for (const edge of [segments[seg * 2], segments[seg * 2 + 1]]) {
      const list = atEdge.get(edge)
      if (list) list.push(seg)
      else atEdge.set(edge, [seg])
    }
  }
  const used = new Uint8Array(count)
  const lines: number[][] = []
  const walk = (firstSeg: number, firstEdge: number) => {
    const line = [...crossingPoint(field, w, h, level, firstEdge)]
    let seg = firstSeg
    let edge = firstEdge
    for (;;) {
      used[seg] = 1
      const next = segments[seg * 2] === edge ? segments[seg * 2 + 1] : segments[seg * 2]
      line.push(...crossingPoint(field, w, h, level, next))
      if (next === firstEdge) break
      const following = atEdge.get(next)?.find((candidate) => !used[candidate])
      if (following === undefined) break
      seg = following
      edge = next
    }
    lines.push(line)
  }
  // Open lines start at a grid-edge end so they come out whole; what remains are closed rings.
  for (const [edge, list] of atEdge) if (list.length === 1 && !used[list[0]]) walk(list[0], edge)
  for (let seg = 0; seg < count; seg++) if (!used[seg]) walk(seg, segments[seg * 2])
  return lines
}

export function contours(field: Float32Array, w: number, h: number, levels: number[]): number[][][] {
  if (!(w >= 2 && h >= 2) || field.length !== w * h) throw new Error(`contours: field of ${field.length} does not match ${w} x ${h}`)
  return levels.map((level) => stitch(field, w, h, level, segmentsAt(field, w, h, level)))
}
