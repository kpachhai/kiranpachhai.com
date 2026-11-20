// Index lens: the typographic list. Large names on ruled rows, the proof count at the right.
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

const DISPLAY_EM = 0.54

interface IndexGeometry {
  top: number
  rowH: number
  w: number
  height: number
}

function geometry(width: number, m: LensModel, opts?: LayoutOptions): IndexGeometry {
  const s = scaleOf(opts)
  const v = (px: number) => Math.round(px * s)
  const wide = width >= BREAK_TABLET
  const w = wide ? Math.min(width - 8, 900) : width - 8
  const fontPx = (wide ? 44 : 27) * s
  const textW = w - 8 - (wide ? 120 * s : 0)
  const lines = Math.max(...m.domains.map((domain) => lineCount(domain.name, textW, fontPx, DISPLAY_EM)))
  const rowH = Math.max(v(wide ? 84 : 66), Math.ceil(lines * fontPx * 1.06 + v(18)))
  const top = v(wide ? 70 : 84)
  return { top, rowH, w, height: top + m.domains.length * rowH + v(28) }
}

export function layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
  const geo = geometry(stage.width, m, opts)
  return m.domains.map((domain, i) => ({ domainId: domain.id, x: 4, y: geo.top + i * geo.rowH, w: geo.w, h: geo.rowH, variant: 'index' }))
}

export function height(width: number, m: LensModel, opts?: LayoutOptions): number {
  return geometry(width, m, opts).height
}

export function decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel): Animation[] {
  const group = decoGroup(svg, 'index')
  const animations: (Animation | null)[] = []
  const first = layouts[0]
  const rules = [...layouts.map((node) => node.y), layouts[layouts.length - 1].y + layouts[layouts.length - 1].h]
  rules.forEach((y, i) => {
    const rule = svgEl('path', { d: `M${first.x} ${y - 0.5}H${first.x + first.w}`, class: i === 0 ? 'ln rule-strong' : 'ln-thin rule' }, group)
    animations.push(drawIn(rule, i * 70, 700))
  })
  const head = htmlBlock(group, first.x, 12, first.w, Math.max(0, first.y - 16), 'ihead')
  head.append(html('h3', '', ['Areas of work']), html('span', 'eyebrow', [`${m.domains.length} areas / open one for its proof`]))
  animations.push(fadeIn(head, 0, 500))
  return animations.filter(present)
}
