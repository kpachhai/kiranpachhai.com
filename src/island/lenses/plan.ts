// Plan lens: a blueprint general arrangement. Six boxed items wired to a hub that holds the
// language parts, balloon callouts naming each item's lead proof, a dimension line that counts
// rather than measures, and a revision table of the methods with a title block.
// Every drawn group carries a data-phase, so the intro can retime the draw-in by phase.
import type { MethodId } from '../../model/schema'
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
  languageCount,
  lineCount,
  methodsOf,
  present,
  scaleOf,
  svgEl,
  svgText,
} from './shared'

type Box = { x: number; y: number; w: number; h: number }
interface PlanGeometry {
  wide: boolean
  side: boolean
  pad: number
  drawW: number
  boxes: Box[]
  hub: Box
  bus: [number, number]
  dimY: number
  table: Box
  height: number
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
// The hub holds a title, the strip of language parts, and a counts line; heights in px at 16 px rem.
const HUB_H = 108

export type IntroPhase = 'frame' | 'wire' | 'dim' | 'hub' | 'callout' | 'sheet'

// The proof each balloon names: the first proof listed for the item's domain.
export function leadProofs(m: LensModel): string[] {
  return m.domains.map((domain) => m.proofs.find((proof) => proof.domainId === domain.id)?.label ?? '')
}

// Rows of the revision table: each method and the item numbers of the domains whose proofs use it.
export function revisions(m: LensModel): { id: MethodId; name: string; items: number[] }[] {
  return m.methods.map((method) => ({
    id: method.id,
    name: method.name,
    items: m.domains.flatMap((domain, position) => (methodsOf(m, domain.id).includes(method.id) ? [position + 1] : [])),
  }))
}

function boxHeight(m: LensModel, boxWidth: number, fontPx: number, s: number, minimum: number, padX = 28): number {
  const lines = Math.max(...m.domains.map((domain) => lineCount(domain.name.toUpperCase(), boxWidth - padX, fontPx, 0.62)))
  return Math.max(minimum, Math.ceil(lines * fontPx * 1.14 + 44 * s))
}

function tableHeight(s: number): number {
  return Math.round((30 + 5 * 40 + 14 + 104) * s)
}

function geometry(width: number, m: LensModel, opts?: LayoutOptions): PlanGeometry {
  const s = scaleOf(opts)
  const v = (px: number) => Math.round(px * s)
  if (width >= BREAK_TABLET) {
    const side = width >= BREAK_DESK
    const tableW = side ? clamp(Math.round(width * 0.32), 300, 380) : 0
    const drawW = side ? width - tableW - 20 : width
    const pad = 28
    const gap = 22
    const bw = Math.floor((drawW - pad * 2 - gap * 2) / 3)
    const bh = boxHeight(m, bw, 17 * s, s, v(100))
    const row1 = v(108)
    const bus1 = row1 + bh + v(26)
    const hubW = Math.min(340, drawW - pad * 2)
    const hub = { x: Math.round(drawW / 2 - hubW / 2), y: bus1 + v(24), w: hubW, h: v(HUB_H) }
    const bus2 = hub.y + hub.h + v(24)
    const row2 = bus2 + v(26)
    const drawH = row2 + bh + v(56)
    const boxes = m.domains.map((_, i) => ({ x: pad + (i % 3) * (bw + gap), y: i < 3 ? row1 : row2, w: bw, h: bh }))
    const table = side
      ? { x: drawW + 4, y: v(24), w: tableW - 20, h: tableHeight(s) }
      : { x: pad, y: drawH, w: drawW - pad * 2, h: tableHeight(s) }
    const height = side ? Math.max(drawH, table.y + table.h + v(24)) : table.y + table.h + v(24)
    return { wide: true, side, pad, drawW, boxes, hub, bus: [bus1, bus2], dimY: v(60), table, height }
  }
  const pad = 14
  const colGap = 16
  const bw = Math.floor((width - pad * 2 - colGap) / 2)
  const bh = boxHeight(m, bw, 14 * s, s, v(96), 24)
  const hub = { x: pad, y: v(24), w: width - pad * 2, h: v(HUB_H) }
  const firstRow = hub.y + hub.h + v(38)
  const step = bh + v(46)
  const boxes = m.domains.map((_, i) => ({ x: pad + (i % 2) * (bw + colGap), y: firstRow + Math.floor(i / 2) * step, w: bw, h: bh }))
  const lastBottom = boxes[boxes.length - 1].y + bh
  // Room under the last row for its balloons before the dimension line.
  const dimY = lastBottom + v(48)
  const table = { x: pad, y: dimY + v(26), w: width - pad * 2, h: tableHeight(s) }
  return { wide: false, side: false, pad, drawW: width, boxes, hub, bus: [0, 0], dimY, table, height: table.y + table.h + v(16) }
}

export function layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  return geometry(stage.width, m, opts).boxes.map((box, i) => ({ domainId: m.domains[i].id, ...box, variant: 'plan' }))
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return geometry(width, m, opts).height
}

function dimension(group: SVGGElement, x1: number, x2: number, y: number, label: string, at: number, rem: number): Animation[] {
  const mid = (x1 + x2) / 2
  const ticks = svgEl('path', { d: `M${x1} ${y - 9}V${y + 9}M${x2} ${y - 9}V${y + 9}`, class: 'ln-thin' }, group)
  const line = svgEl('path', { d: `M${x1} ${y}H${x2}`, class: 'ln-thin' }, group)
  const arrows = svgEl('path', { d: `M${x1} ${y}l8 -3.5v7z M${x2} ${y}l-8 -3.5v7z`, class: 'dotf' }, group)
  const tag = svgEl('g', {}, group)
  const gap = svgEl('rect', { x: mid, y: y - 9 * rem, width: 0, height: 18 * rem, class: 'gap-bg' }, tag)
  const text = fitText(svgText(tag, mid, y + 3.5 * rem, label, 'svg-lab'), x2 - x1 - 40)
  const labelW = Math.min(text.getComputedTextLength(), x2 - x1 - 40) + 20
  gap.setAttribute('x', String(mid - labelW / 2))
  gap.setAttribute('width', String(labelW))
  return [drawIn(ticks, at, 300), drawIn(line, at + 100, 600), fadeIn(arrows, at + 100, 300), fadeIn(tag, at + 400, 300)].filter(present)
}

function revisionTable(m: LensModel, geo: PlanGeometry, group: SVGGElement): HTMLElement {
  const block = htmlBlock(group, geo.table.x, geo.table.y, geo.table.w, geo.table.h, 'plan-sheet')
  const head = html('tr', '', ['REV', 'METHOD', 'ITEMS'].map((label) => html('th', '', [label])))
  const rows = revisions(m).map((row) => {
    const tr = html('tr', '', [
      html('td', '', [row.id]),
      html('td', '', [html('b', '', [row.name])]),
      html('td', '', [row.items.length > 0 ? row.items.join(', ') : '-']),
    ])
    tr.dataset.m = row.id
    return tr
  })
  const table = html('table', 'rev', [html('thead', '', [head]), html('tbody', '', rows)])
  const titleBlock = html('div', 'tblock', [
    html('div', 'tname', ['GENERAL ARRANGEMENT']),
    html('div', 'tsub', [`CAPABILITY MAP / ${m.domains.length} AREAS OF WORK`]),
    html('div', '', ['DRAWING', html('b', '', ['KP-001'])]),
    html('div', '', ['LENS', html('b', '', ['PLAN'])]),
    html('div', '', ['SHEET', html('b', '', ['1 OF 5'])]),
  ])
  block.append(table, titleBlock)
  return block
}

const phase = (parent: Element, name: IntroPhase) => svgEl('g', { 'data-phase': name }, parent)

// SVG text never wraps: a label longer than its room drops words and ends in an ellipsis.
// It may be measured before the web font arrives, so 10% of the room is kept spare.
function clipLabel(text: SVGTextElement, space: number): void {
  const room = space * 0.9
  const words = (text.textContent ?? '').split(' ')
  while (text.getComputedTextLength() > room && words.length > 1) {
    words.pop()
    text.textContent = `${words.join(' ')}\u2026`
  }
  fitText(text, room)
}

// The language parts sit as a strip inside the hub; the intro flies them in along their axes.
function hubParts(hub: SVGGElement, geo: PlanGeometry, m: LensModel, rem: number): void {
  const languages = m.materials.filter((material) => material.band === 'language')
  const inset = 10
  const gap = 6
  const w = (geo.hub.w - inset * 2 - gap * (languages.length - 1)) / languages.length
  const y = geo.hub.y + 36 * rem
  const h = 26 * rem
  languages.forEach((material, k) => {
    const x = geo.hub.x + inset + k * (w + gap)
    const part = svgEl('g', { class: 'part', 'data-part': material.id }, hub)
    svgEl('rect', { x, y, width: w, height: h, class: 'part-box' }, part)
    fitText(svgText(part, x + w / 2, y + h / 2 + 3.5 * rem, material.name.toUpperCase(), 'svg-part'), w - 8)
  })
}

// A leader from each item to a numbered balloon and the item's lead proof. Wide sheets put the
// balloons above the top row and below the bottom row; phones put them under each box.
function callouts(group: SVGGElement, layouts: NodeLayout[], geo: PlanGeometry, m: LensModel, rem: number): Animation[] {
  const labels = leadProofs(m)
  const r = (geo.wide ? 9 : 8) * rem
  const animations: (Animation | null)[] = []
  layouts.forEach((node, i) => {
    const top = geo.wide && i < 3
    const bx = geo.wide ? node.x + 56 : node.x + node.w - 14
    const by = top ? node.y - 24 * rem : node.y + node.h + (geo.wide ? 30 : 22) * rem
    const y1 = top ? node.y : node.y + node.h
    const call = svgEl('g', { class: 'cal' }, group)
    const leader = svgEl('path', { d: `M${bx} ${y1}V${top ? by + r : by - r}`, class: 'ln-thin' }, call)
    const dot = svgEl('circle', { cx: bx, cy: y1, r: 2.2, class: 'dotf' }, call)
    const balloon = svgEl('g', {}, call)
    svgEl('circle', { cx: bx, cy: by, r, class: 'cal-c' }, balloon)
    svgText(balloon, bx, by + 3.4 * rem, String(i + 1), 'cal-n')
    if (geo.wide) {
      const x = bx + r + 6
      const limit = i % 3 === 2 ? geo.drawW - 10 : layouts[i + 1].x + 56 - r - 10
      clipLabel(svgText(balloon, x, by + 3.5 * rem, labels[i], 'cal-t', 'start'), limit - x)
    } else {
      const x = bx - r - 6
      clipLabel(svgText(balloon, x, by + 3.5 * rem, labels[i], 'cal-t', 'end'), x - node.x - 2)
    }
    animations.push(drawIn(leader, 300 + i * 60, 260), fadeIn(dot, 300 + i * 60, 200), fadeIn(balloon, 450 + i * 60, 300))
  })
  return animations.filter(present)
}

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel, opts?: LayoutOptions): Animation[] {
  const width = Number(svg.getAttribute('width'))
  const stageH = Number(svg.getAttribute('height'))
  const geo = geometry(width, m, opts)
  const rem = scaleOf(opts)
  const group = decoGroup(svg, 'plan')
  const animations: (Animation | null)[] = []

  const grid = phase(group, 'frame')
  for (let x = 40; x < width; x += 40) svgEl('path', { d: `M${x} 0V${stageH}`, class: 'ln-faint' }, grid)
  for (let y = 40; y < stageH; y += 40) svgEl('path', { d: `M0 ${y}H${width}`, class: 'ln-faint' }, grid)
  animations.push(fadeIn(grid, 0, 500))
  animations.push(drawIn(svgEl('rect', { x: 6, y: 6, width: width - 12, height: stageH - 12, class: 'ln-thin' }, grid), 0, 700))

  const wires = phase(group, 'wire')
  const centre = (node: NodeLayout) => node.x + node.w / 2
  const hubX = geo.hub.x + geo.hub.w / 2
  if (geo.wide) {
    const [bus1, bus2] = geo.bus
    const top = layouts.slice(0, 3)
    const bottom = layouts.slice(3)
    top.forEach((node, k) => animations.push(drawIn(svgEl('path', { d: `M${centre(node)} ${node.y + node.h}V${bus1}`, class: 'ln' }, wires), 120 + k * 60, 300)))
    bottom.forEach((node, k) => animations.push(drawIn(svgEl('path', { d: `M${centre(node)} ${node.y}V${bus2}`, class: 'ln' }, wires), 120 + k * 60, 300)))
    for (const [row, bus, end] of [[top, bus1, geo.hub.y], [bottom, bus2, geo.hub.y + geo.hub.h]] as const) {
      animations.push(drawIn(svgEl('path', { d: `M${centre(row[0])} ${bus}H${centre(row[row.length - 1])}`, class: 'ln' }, wires), 300, 500))
      animations.push(drawIn(svgEl('path', { d: `M${hubX} ${bus}V${end}`, class: 'ln' }, wires), 600, 200))
      for (const x of [...row.map(centre), hubX]) animations.push(fadeIn(svgEl('circle', { cx: x, cy: bus, r: 3, class: 'dotf' }, wires), 750))
    }
    animations.push(...dimension(phase(group, 'dim'), geo.pad, geo.drawW - geo.pad, geo.dimY, `${m.domains.length} AREAS OF WORK / ${m.proofs.length} PROOF ITEMS`, 500, rem))
  } else {
    const trunkX = layouts[0].x + layouts[0].w + (layouts[1].x - layouts[0].x - layouts[0].w) / 2
    const last = layouts[layouts.length - 1]
    animations.push(drawIn(svgEl('path', { d: `M${trunkX} ${geo.hub.y + geo.hub.h}V${last.y + last.h / 2}`, class: 'ln' }, wires), 120, 600))
    for (let row = 0; row < layouts.length; row += 2) {
      const left = layouts[row]
      const y = left.y + left.h / 2
      animations.push(drawIn(svgEl('path', { d: `M${left.x + left.w} ${y}H${layouts[row + 1].x}`, class: 'ln' }, wires), 450 + row * 40, 200))
      animations.push(fadeIn(svgEl('circle', { cx: trunkX, cy: y, r: 3, class: 'dotf' }, wires), 600 + row * 40))
    }
    animations.push(...dimension(phase(group, 'dim'), geo.pad, width - geo.pad, geo.dimY, `${m.domains.length} AREAS / ${m.proofs.length} PROOF ITEMS`, 600, rem))
  }

  const hub = phase(group, 'hub')
  svgEl('rect', { x: geo.hub.x, y: geo.hub.y, width: geo.hub.w, height: geo.hub.h, class: 'hub-box', 'data-hub': '' }, hub)
  const room = geo.hub.w - 20
  fitText(svgText(hub, hubX, geo.hub.y + 25 * rem, 'CAPABILITY MAP', 'svg-hub'), room)
  hubParts(hub, geo, m, rem)
  fitText(svgText(hub, hubX, geo.hub.y + 88 * rem, `${languageCount(m)} PRIMARY LANGUAGES / ${m.methods.length} METHODS / ${m.proofs.length} PROOFS`, 'svg-mut'), room)
  animations.push(fadeIn(hub, 200, 500))

  animations.push(...callouts(phase(group, 'callout'), layouts, geo, m, rem))
  animations.push(fadeIn(revisionTable(m, geo, phase(group, 'sheet')), 250, 500))
  return animations.filter(present)
}
