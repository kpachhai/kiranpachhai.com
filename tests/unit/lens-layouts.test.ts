import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { buildIslandData } from '../../src/island/data'
import type { NodeLayout } from '../../src/island/lenses/shared'
import * as plan from '../../src/island/lenses/plan'
import * as consoleLens from '../../src/island/lenses/console'
import * as index from '../../src/island/lenses/index'
import * as range from '../../src/island/lenses/range'
import * as terrain from '../../src/island/lenses/terrain'

const data = buildIslandData(model)
const LENSES = { plan, terrain, console: consoleLens, index, range }
const WIDTHS = [390, 720, 1280]
const REM = [16, 32]

function overlaps(a: NodeLayout, b: NodeLayout): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe.each(Object.entries(LENSES))('%s layout()', (id, lens) => {
  for (const width of WIDTHS) {
    for (const rem of REM) {
      it(`at ${width} px (rem ${rem}) returns 6 rects inside the stage with no overlap`, () => {
        const stage = { width, height: lens.height(width, data, { rem }) }
        const nodes = lens.layout(stage, data, { rem })
        expect(nodes).toHaveLength(6)
        expect(nodes.map((node) => node.domainId)).toEqual(data.domains.map((domain) => domain.id))
        for (const node of nodes) {
          expect(node.variant).toBe(id)
          expect(node.w, node.domainId).toBeGreaterThan(0)
          expect(node.h, node.domainId).toBeGreaterThan(0)
          expect(node.x, node.domainId).toBeGreaterThanOrEqual(0)
          expect(node.y, node.domainId).toBeGreaterThanOrEqual(0)
          expect(node.x + node.w, node.domainId).toBeLessThanOrEqual(stage.width)
          expect(node.y + node.h, node.domainId).toBeLessThanOrEqual(stage.height)
        }
        for (let first = 0; first < nodes.length; first++) {
          for (let second = first + 1; second < nodes.length; second++) {
            expect(overlaps(nodes[first], nodes[second]), `${nodes[first].domainId} / ${nodes[second].domainId}`).toBe(false)
          }
        }
      })
    }
  }

  it('is pure: the same input gives the same output', () => {
    const stage = { width: 720, height: lens.height(720, data, { rem: 16 }) }
    expect(lens.layout(stage, data, { rem: 16 })).toEqual(lens.layout(stage, data, { rem: 16 }))
  })

  it('grows its rows when the root font size doubles', () => {
    expect(lens.height(390, data, { rem: 32 })).toBeGreaterThan(lens.height(390, data, { rem: 16 }))
  })
})

describe('range cells', () => {
  it('fills a cell only where model.range lists one', () => {
    const filled = range.cells(data).filter((cell) => cell.proofIds.length > 0)
    expect(filled.map((cell) => `${cell.domainId}/${cell.mode}`).sort()).toEqual(
      model.range.map((cell) => `${cell.domainId}/${cell.mode}`).sort(),
    )
    expect(range.cells(data)).toHaveLength(model.domains.length * model.modes.length)
  })
})

describe('plan revision table', () => {
  it('lists the five current methods with the domains whose proofs use them', () => {
    const rows = plan.revisions(data)
    expect(rows.map((row) => `${row.id} ${row.name}`)).toEqual([
      'A Spec first',
      'B Staged gates',
      'C Provenance',
      'D Plugin standards',
      'E Explain it visually',
    ])
    for (const row of rows) {
      const expected = model.domains
        .map((domain, position) => ({ domain, position }))
        .filter(({ domain }) => model.proofs.some((proof) => proof.domainId === domain.id && proof.methods.includes(row.id)))
        .map(({ position }) => position + 1)
      expect(row.items, row.id).toEqual(expected)
    }
    expect(JSON.stringify(rows)).not.toMatch(/HIP-?\d/)
  })
})

describe('plan balloon callouts', () => {
  it('name the first proof of each domain, in domain order, with no HIP number', () => {
    const labels = plan.leadProofs(data)
    expect(labels).toEqual(model.domains.map((domain) => model.proofs.find((proof) => proof.domainId === domain.id)!.label))
    for (const label of labels) expect(label.length).toBeGreaterThan(0)
    expect(labels.join(' ')).not.toMatch(/HIP-?\d/)
  })
})
