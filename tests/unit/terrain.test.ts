import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { buildIslandData } from '../../src/island/data'
import { methodsOf } from '../../src/island/lenses/shared'
import { PEAK, elevation, summitsOf, trails } from '../../src/island/lenses/terrain'
import * as terrain from '../../src/island/lenses/terrain'

const data = buildIslandData(model)

describe('terrain relief', () => {
  for (const width of [390, 1280]) {
    it(`at ${width} px every summit has the same height and is the highest point`, () => {
      const stageHeight = terrain.height(width, data)
      const nodes = terrain.layout({ width, height: stageHeight }, data)
      const relief = summitsOf(nodes, width, data)
      expect(relief.summits).toHaveLength(6)
      for (const t of [0, 0.37, 4.2]) {
        for (const [x, y] of relief.summits) expect(elevation(x, y, relief, t)).toBeCloseTo(PEAK, 12)
        let highest = -Infinity
        for (let y = 0; y <= relief.height; y += 3) for (let x = 0; x <= relief.width; x += 3) highest = Math.max(highest, elevation(x, y, relief, t))
        expect(highest).toBeLessThanOrEqual(PEAK + 1e-12)
      }
    })
  }

  it('phones get a taller portrait canvas', () => {
    const narrow = summitsOf(terrain.layout({ width: 390, height: terrain.height(390, data) }, data), 390, data)
    expect(narrow.height).toBeGreaterThan(narrow.width)
  })
})

describe('terrain trails', () => {
  it('draws one trail per method shared by two or more areas, through those areas in model order', () => {
    const expected = data.methods
      .map((method) => ({ methodId: method.id, path: data.domains.map((domain, index) => (methodsOf(data, domain.id).includes(method.id) ? index : -1)).filter((index) => index >= 0) }))
      .filter((trail) => trail.path.length >= 2)
    expect(expected.length).toBeGreaterThan(0)
    expect(trails(data).map(({ methodId, path }) => ({ methodId, path }))).toEqual(expected)
  })
})
