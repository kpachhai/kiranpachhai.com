// Range lens: the six areas as rows against the five modes of work. A cell is filled only when
// model.range lists proof for it; every other cell stays empty.
import type { DomainId, ModeId } from '../../model/schema'
import {
  BREAK_DESK,
  BREAK_TABLET,
  type LayoutOptions,
  type LensModel,
  type NodeLayout,
  type StageRect,
  decoGroup,
  drawIn,
  fadeIn,
  fitText,
  html,
  htmlBlock,
  lineCount,
  present,
  rootRem,
  scaleOf,
  svgEl,
  svgText,
} from './shared'

const DISPLAY_EM = 0.54

export type RangeCell = { domainId: DomainId; mode: ModeId; proofIds: string[] }

// Every domain against every mode, in model order. Only model.range fills a cell.
export function cells(m: LensModel): RangeCell[] {
  return m.domains.flatMap((domain) =>
    m.modes.map((mode) => ({
      domainId: domain.id,
      mode: mode.id,
      proofIds: m.range.find((cell) => cell.domainId === domain.id && cell.mode === mode.id)?.proofIds ?? [],
    })),
  )
}

const filledIn = (m: LensModel, domainId: DomainId) =>
  Math.max(0, ...m.range.filter((cell) => cell.domainId === domainId).map((cell) => cell.proofIds.length))

interface RangeGeometry {
  wide: boolean
  labels: boolean
  headerH: number
  headW: number
  strip: number
  rows: { y: number; h: number }[]
  height: number
}

function geometry(width: number, m: LensModel, opts?: LayoutOptions): RangeGeometry {
  const s = scaleOf(opts)
  const v = (px: number) => Math.round(px * s)
  const wide = width >= BREAK_TABLET
  const labels = width >= BREAK_DESK
  const rows: { y: number; h: number }[] = []
  if (wide) {
    const headW = labels ? 260 : 200
    const fontPx = 18 * s
    let y = v(40)
    for (const domain of m.domains) {
      const nameH = lineCount(domain.name, headW - 20, fontPx, DISPLAY_EM) * fontPx * 1.15 + v(20)
      const listH = labels ? (14 + filledIn(m, domain.id) * 20) * s : 0
      const h = Math.ceil(Math.max(v(56), nameH, listH))
      rows.push({ y, h })
      y += h
    }
    return { wide, labels, headerH: v(40), headW, strip: 0, rows, height: y + v(12) }
  }
  const fontPx = 16 * s
  const strip = v(38)
  let y = v(34)
  for (const domain of m.domains) {
    const h = Math.ceil(lineCount(domain.name, width - 20, fontPx, DISPLAY_EM) * fontPx * 1.2 + v(14))
    rows.push({ y, h })
    y += h + strip + v(10)
  }
  return { wide, labels, headerH: v(34), headW: width, strip, rows, height: y + v(4) }
}

export function layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  const geo = geometry(stage.width, m, opts)
  return m.domains.map((domain, i) => ({ domainId: domain.id, x: 0, y: geo.rows[i].y, w: geo.headW, h: geo.rows[i].h, variant: 'range' }))
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return geometry(width, m, opts).height
}

const proofLabel = (m: LensModel, id: string) => m.proofs.find((proof) => proof.id === id)?.label ?? id

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel): Animation[] {
  const width = Number(svg.getAttribute('width'))
  const group = decoGroup(svg, 'range')
  const animations: (Animation | null)[] = []
  const { wide, labels, strip } = geometry(width, m, { rem: rootRem() })
  const left = wide ? layouts[0].w : 0
  const colW = (width - left) / m.modes.length
  const firstTop = layouts[0].y

  m.modes.forEach((mode, k) => {
    fitText(svgText(group, left + k * colW + 6, firstTop - 12, mode.name.toUpperCase(), 'svg-lab range-mode', 'start'), colW - 10)
    if (k > 0) animations.push(drawIn(svgEl('path', { d: `M${left + k * colW} ${firstTop}V${svg.getAttribute('height')}`, class: 'ln-faint-range' }, group), 100 + k * 60, 500))
  })
  animations.push(drawIn(svgEl('path', { d: `M0 ${firstTop - 0.5}H${width}`, class: 'ln rule-strong' }, group), 0, 600))

  const byKey = new Map(cells(m).map((cell) => [`${cell.domainId}/${cell.mode}`, cell]))
  layouts.forEach((node, i) => {
    const rowTop = wide ? node.y : node.y + node.h
    const rowH = wide ? node.h : strip
    animations.push(drawIn(svgEl('path', { d: `M0 ${rowTop + rowH - 0.5}H${width}`, class: 'ln-thin rule' }, group), 200 + i * 60, 500))
    m.modes.forEach((mode, k) => {
      const cell = byKey.get(`${node.domainId}/${mode.id}`)
      if (!cell || cell.proofIds.length === 0) return
      const x = left + k * colW
      const block = htmlBlock(group, x + 1, rowTop + 1, colW - 2, rowH - 2, 'range-cell')
      block.dataset.cell = `${cell.domainId}/${cell.mode}`
      if (labels) block.append(html('ul', '', cell.proofIds.map((id) => html('li', '', [proofLabel(m, id)]))))
      else block.append(html('span', 'n', [String(cell.proofIds.length)]))
      // A filled cell opens the same drawer as its row.
      block.addEventListener('click', () => document.querySelector<HTMLElement>(`#stage [data-node="${cell.domainId}"]`)?.click())
      animations.push(fadeIn(block, 350 + i * 50 + k * 30, 300))
    })
  })
  return animations.filter(present)
}
