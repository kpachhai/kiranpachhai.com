// Range lens: the six areas as rows against the four modes of work. A cell is filled only when
// model.range lists proof for it; every other cell stays empty. A second view, roles x hats, sets
// the journey's roles against the hats worn in each; the six area nodes then line up as tiles above.
import type { DomainId, HatId, ModeId } from '../../model/schema'
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
  scaleOf,
  svgEl,
  svgText,
} from './shared'

const DISPLAY_EM = 0.54
const MONO_EM = 0.66

export type RangeView = 'areas' | 'roles'
let view: RangeView = 'areas'

export function currentView(): RangeView {
  return view
}

export function setView(next: RangeView): void {
  view = next
}

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
  if (view === 'roles') return rolesLayout(stage, m, opts)
  const geo = geometry(stage.width, m, opts)
  return m.domains.map((domain, i) => ({ domainId: domain.id, x: 0, y: geo.rows[i].y, w: geo.headW, h: geo.rows[i].h, variant: 'range' }))
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return view === 'roles' ? rolesGeometry(width, m, opts).height : geometry(width, m, opts).height
}

const proofLabel = (m: LensModel, id: string) => m.proofs.find((proof) => proof.id === id)?.label ?? id

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel, opts?: LayoutOptions): Animation[] {
  if (view === 'roles') return decorateRoles(svg, m, opts)
  const width = Number(svg.getAttribute('width'))
  const group = decoGroup(svg, 'range')
  const animations: (Animation | null)[] = []
  const { wide, labels, strip } = geometry(width, m, opts)
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

// Roles x hats. Column labels: the hat names when the columns are wide enough, letters on phones,
// where a key under the matrix spells them out.
const HAT_ABBR: Record<HatId, string> = {
  engineer: 'ENG',
  operator: 'OPS',
  devrel: 'REL',
  educator: 'EDU',
  architect: 'ARC',
  product: 'LEAD',
  protocol: 'L1',
}

export type HatCell = { roleId: string; hat: HatId; on: boolean }

// Every role against every hat, in model order; a cell is on only where the role wears the hat.
export function hatCells(m: LensModel): HatCell[] {
  return m.career.flatMap((role) => m.hats.map((hat) => ({ roleId: role.id, hat: hat.id, on: role.hats.includes(hat.id) })))
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface RolesGeometry {
  wide: boolean
  tiles: Box[]
  headTop: number
  headH: number
  headW: number
  rows: { y: number; labelH: number; h: number }[]
  key: Box | null
  height: number
}

const keyText = (m: LensModel) => m.hats.map((hat) => `${HAT_ABBR[hat.id]} ${hat.name}`).join('   ')

function rolesGeometry(width: number, m: LensModel, opts?: LayoutOptions): RolesGeometry {
  const s = scaleOf(opts)
  const v = (px: number) => Math.round(px * s)
  const wide = width >= BREAK_TABLET
  // The six area nodes as tiles: one row on desktops, two rows on tablets, three on phones.
  const perRow = width >= BREAK_DESK ? 6 : wide ? 3 : 2
  const gap = v(8)
  const tileW = Math.floor((width - gap * (perRow - 1)) / perRow)
  const tileFont = 15 * s
  const tileLines = Math.max(...m.domains.map((domain) => lineCount(domain.name, tileW - v(56), tileFont, DISPLAY_EM)))
  const tileH = Math.ceil(Math.max(v(44), tileLines * tileFont * 1.2 + v(18)))
  const top = v(30)
  const tiles = m.domains.map((_, i) => ({
    x: (i % perRow) * (tileW + gap),
    y: top + Math.floor(i / perRow) * (tileH + gap),
    w: tileW,
    h: tileH,
  }))
  const tileRows = Math.ceil(m.domains.length / perRow)
  const headTop = top + tileRows * tileH + (tileRows - 1) * gap + v(30)
  const headW = wide ? (width >= BREAK_DESK ? 300 : 220) : 0
  const colW = (width - headW) / m.hats.length
  // A slash may or may not break a line, so the header takes the taller of the two estimates.
  const headLines = wide
    ? Math.max(...m.hats.flatMap((hat) => [hat.name, hat.name.replace(/\//g, '/ ')].map((label) => lineCount(label.toUpperCase(), colW - 12, 11 * s, MONO_EM))))
    : 1
  const headH = Math.ceil(headLines * 11 * s * 1.4 + v(14))
  const titleFont = 15 * s
  const labelW = wide ? headW - 16 : width
  let y = headTop + headH
  const rows = m.career.map((role) => {
    const labelH = Math.ceil(lineCount(role.title, labelW, titleFont, DISPLAY_EM) * titleFont * 1.2 + 11 * s * 1.6 + v(14))
    const h = wide ? Math.max(v(48), labelH) : labelH + v(30)
    const row = { y, labelH, h }
    y += h + (wide ? 0 : v(8))
    return row
  })
  let key: Box | null = null
  if (!wide) {
    const keyH = Math.ceil(lineCount(keyText(m), width, 11 * s, MONO_EM) * 11 * s * 1.6 + v(12))
    key = { x: 0, y: y + v(6), w: width, h: keyH }
    y = key.y + keyH
  }
  return { wide, tiles, headTop, headH, headW, rows, key, height: y + v(12) }
}

function rolesLayout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  const geo = rolesGeometry(stage.width, m, opts)
  return m.domains.map((domain, i) => ({ domainId: domain.id, ...geo.tiles[i], variant: 'range' }))
}

function decorateRoles(svg: SVGSVGElement, m: LensModel, opts?: LayoutOptions): Animation[] {
  const width = Number(svg.getAttribute('width'))
  const group = decoGroup(svg, 'range')
  const animations: (Animation | null)[] = []
  const geo = rolesGeometry(width, m, opts)
  const { wide, headTop, headH, headW } = geo
  const colW = (width - headW) / m.hats.length
  const bodyTop = headTop + headH
  const lastRow = geo.rows[geo.rows.length - 1]

  const areasLabel = fitText(svgText(group, 0, geo.tiles[0].y - 12, 'AREAS OF WORK, OPEN ONE FOR ITS PROOF', 'svg-lab range-mode', 'start'), width)
  animations.push(fadeIn(areasLabel, 0, 300))
  if (wide) {
    const corner = htmlBlock(group, 0, headTop, headW, headH, 'range-hat-head corner')
    corner.append(html('span', '', ['Role']))
    animations.push(fadeIn(corner, 0, 300))
  }
  m.hats.forEach((hat, k) => {
    const x = headW + k * colW
    if (wide) {
      const head = htmlBlock(group, x, headTop, colW, headH, 'range-hat-head')
      // A line may break after each slash ("Educator/ course author"), never inside a word.
      const parts = hat.name.split('/').flatMap((part, index): (Node | string)[] => (index === 0 ? [part] : ['/', html('wbr', ''), part]))
      head.append(html('span', '', parts))
      animations.push(fadeIn(head, 60 + k * 40, 300))
    } else {
      fitText(svgText(group, x + colW / 2, headTop + headH - 10, HAT_ABBR[hat.id], 'svg-lab range-mode'), colW - 4)
    }
    if (wide && k > 0) animations.push(drawIn(svgEl('path', { d: `M${x} ${bodyTop}V${lastRow.y + lastRow.h}`, class: 'ln-faint-range' }, group), 100 + k * 60, 500))
  })
  animations.push(drawIn(svgEl('path', { d: `M0 ${bodyTop - 0.5}H${width}`, class: 'ln rule-strong' }, group), 0, 600))

  const cells = hatCells(m)
  m.career.forEach((role, i) => {
    const row = geo.rows[i]
    const label = htmlBlock(group, 0, row.y, wide ? headW : width, row.labelH, 'range-role')
    label.append(html('b', '', [role.title]), html('span', '', [role.years]))
    animations.push(fadeIn(label, 200 + i * 50, 300))
    const stripTop = wide ? row.y : row.y + row.labelH
    const stripH = wide ? row.h : row.h - row.labelH
    animations.push(drawIn(svgEl('path', { d: `M0 ${row.y + row.h - 0.5}H${width}`, class: 'ln-thin rule' }, group), 200 + i * 60, 500))
    // On phones the hat columns sit in a strip under each role's label.
    if (!wide) {
      animations.push(drawIn(svgEl('path', { d: `M0 ${stripTop - 0.5}H${width}`, class: 'ln-faint-range' }, group), 200 + i * 60, 500))
      for (let k = 1; k < m.hats.length; k++) {
        animations.push(drawIn(svgEl('path', { d: `M${k * colW} ${stripTop}V${stripTop + stripH}`, class: 'ln-faint-range' }, group), 250 + i * 60, 400))
      }
    }
    m.hats.forEach((hat, k) => {
      const cell = cells.find((item) => item.roleId === role.id && item.hat === hat.id)
      if (!cell?.on) return
      const block = htmlBlock(group, headW + k * colW + 1, stripTop + 1, colW - 2, stripH - 2, 'range-cell range-hat')
      block.dataset.hatCell = `${role.id}/${hat.id}`
      animations.push(fadeIn(block, 350 + i * 50 + k * 30, 300))
    })
  })

  if (geo.key) {
    const key = htmlBlock(group, geo.key.x, geo.key.y, geo.key.w, geo.key.h, 'range-key')
    key.append(...m.hats.map((hat) => html('span', '', [html('b', '', [HAT_ABBR[hat.id]]), ` ${hat.name}`])))
    animations.push(fadeIn(key, 500, 300))
  }
  return animations.filter(present)
}
