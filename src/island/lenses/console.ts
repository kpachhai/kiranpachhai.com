// Console lens: `kp map --capabilities` prints the six areas as a tree, and `kp gates --methods`
// runs the five methods as gates that pass. The tree bars live in an SVG gutter, so a label that
// wraps onto a second line keeps its bar.
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
  present,
  scaleOf,
  svgEl,
} from './shared'

const MONO_EM = 0.66
const TYPE_MS = 28
const GATE_STEP_MS = 220

interface ConsoleGeometry {
  top: number
  rowH: number
  gatesTop: number
  lineH: number
  height: number
}

function geometry(width: number, m: LensModel, opts?: LayoutOptions): ConsoleGeometry {
  const s = scaleOf(opts)
  const v = (px: number) => Math.round(px * s)
  const wide = width >= BREAK_TABLET
  const fontPx = (wide ? 14 : 13) * s
  // Left gutter 36, number column 5ch, gaps, and on wide screens a proof count at the right.
  const reserved = 36 + 14 + fontPx * MONO_EM * 5 + 10 + (wide ? 12 * s * MONO_EM * 9 + 10 : 0)
  const lines = Math.max(...m.domains.map((domain) => lineCount(domain.name, width - reserved, fontPx, MONO_EM)))
  const rowH = Math.max(v(wide ? 42 : 44), Math.ceil(lines * fontPx * 1.35 + v(16)))
  const top = v(96)
  const gatesTop = top + m.domains.length * rowH + v(20)
  const lineH = v(23)
  const gateLines = Math.max(...m.methods.map((method) => lineCount(`[1/5] ${method.name} ... pass`, width - 32, 13 * s, MONO_EM)))
  const height = gatesTop + lineH * (1 + m.methods.length * gateLines) + v(28)
  return { top, rowH, gatesTop, lineH, height }
}

export function layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  const geo = geometry(stage.width, m, opts)
  return m.domains.map((domain, i) => ({ domainId: domain.id, x: 0, y: geo.top + i * geo.rowH, w: stage.width, h: geo.rowH, variant: 'console' }))
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return geometry(width, m, opts).height
}

// The font subset has no check mark glyph, so the pass mark is drawn.
function passMark(): SVGSVGElement {
  const icon = svgEl('svg', { viewBox: '0 0 12 12', width: 12, height: 12, class: 'pass-mark', 'aria-hidden': 'true' })
  svgEl('path', { d: 'M2 6.5L5 9.5L10 3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'square' }, icon)
  return icon
}

function command(text: string): { line: HTMLElement; typed: HTMLElement } {
  const typed = html('span', 'typed', [text])
  return { line: html('div', '', [html('span', 'ps', ['$']), typed]), typed }
}

function typeIn(element: HTMLElement, delay: number): Animation {
  const length = element.textContent?.length ?? 1
  return element.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
    duration: length * TYPE_MS,
    delay,
    easing: `steps(${length}, end)`,
    fill: 'backwards',
  })
}

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel): Animation[] {
  const width = Number(svg.getAttribute('width'))
  const group = decoGroup(svg, 'console')
  const animations: (Animation | null)[] = []
  const first = layouts[0]
  const last = layouts[layouts.length - 1]

  const bands = svgEl('g', {}, group)
  layouts.forEach((node, i) => {
    if (i % 2 === 0) svgEl('rect', { x: 0, y: node.y, width, height: node.h, class: 'band' }, bands)
  })
  animations.push(fadeIn(bands, 0, 300))

  const gutterX = 16
  animations.push(drawIn(svgEl('path', { d: `M${gutterX} ${first.y - 8}V${last.y + last.h / 2}`, class: 'ln-thin' }, group), 0, 500))
  layouts.forEach((node, i) => {
    const y = node.y + node.h / 2
    animations.push(drawIn(svgEl('path', { d: `M${gutterX} ${y}H${gutterX + 14}`, class: 'ln-thin' }, group), 250 + i * 60, 160))
  })

  const proofs = m.proofs.length
  const head = htmlBlock(group, 16, 16, width - 32, first.y - 24, 'cl')
  const map = command('kp map --capabilities')
  head.append(map.line, html('div', 'mut', [`${m.domains.length} areas / ${proofs} proofs / Enter opens one`]))
  animations.push(typeIn(map.typed, 120))
  let at = 120 + (map.typed.textContent?.length ?? 0) * TYPE_MS + 300

  const gatesTop = last.y + last.h + 20
  const gates = htmlBlock(group, 16, gatesTop, width - 32, Math.max(0, Number(svg.getAttribute('height')) - gatesTop), 'cl')
  const run = command('kp gates --methods')
  const rows = m.methods.map((method, i) => {
    const status = html('span', 'st', [passMark(), 'pass'])
    const row = html('div', 'gate-row', [
      html('span', 'mut', [`[${i + 1}/${m.methods.length}]`]),
      html('span', 'gn', [`${method.id} `, html('span', 'mn', [method.name])]),
      html('span', 'lead', []),
      status,
    ])
    row.dataset.m = method.id
    return { row, status }
  })
  gates.append(run.line, html('div', 'gates', rows.map(({ row }) => row)), html('div', '', [html('span', 'ps', ['$']), html('span', 'caret', [' '])]))
  animations.push(typeIn(run.typed, at))
  at += (run.typed.textContent?.length ?? 0) * TYPE_MS + 300
  rows.forEach(({ status }, i) => animations.push(fadeIn(status, at + i * GATE_STEP_MS, 120)))
  animations.push(fadeIn(head, 0, 200))
  return animations.filter(present)
}

