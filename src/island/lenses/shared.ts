// Shared pieces for the lens modules: the layout contract, a pure text-height estimate,
// and the SVG and animation helpers every decorate() uses.
import type { DomainId, MethodId } from '../../model/schema'
import type { IslandData } from '../data'
import type { LensId } from '../state'

export type NodeLayout = { domainId: DomainId; x: number; y: number; w: number; h: number; variant: LensId }
export type StageRect = { width: number; height: number }
// rem is the root font size in px; heights scale with it so a larger text setting still fits.
export type LayoutOptions = { rem?: number }
export type LensModel = IslandData

export interface LensModule {
  layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[]
  height(width: number, m: LensModel, opts?: LayoutOptions): number
  decorate(svg: SVGSVGElement, layouts: NodeLayout[], m: LensModel): Animation[]
  // Gives back what decorate made outside the SVG layer (Terrain's canvas and its loop).
  release?(): void
}

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const FADE_MS = 180
export const MORPH_MS = 800
export const STAGGER_MS = 50
export const DRAW_MS = 600
// Phase 3 starts while the last nodes are still settling: 70% of one move plus the full stagger.
export const DRAW_IN_AT = Math.round(MORPH_MS * 0.7) + STAGGER_MS * 5

export const BREAK_TABLET = 720
export const BREAK_DESK = 1024

export const scaleOf = (opts?: LayoutOptions) => (opts?.rem ?? 16) / 16

export function rootRem(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

// Lines a label needs at a width, from an average glyph width in em. Deliberately pessimistic,
// so an estimate that is off leaves spare room rather than clipping.
export function lineCount(text: string, widthPx: number, fontPx: number, glyphEm: number): number {
  const perLine = Math.max(1, Math.floor(widthPx / (fontPx * glyphEm)))
  let lines = 1
  let used = 0
  for (const word of text.split(/\s+/)) {
    const length = word.length
    if (used === 0) used = length
    else if (used + 1 + length <= perLine) used += 1 + length
    else {
      lines += 1
      used = length
    }
    while (used > perLine) {
      lines += 1
      used -= perLine
    }
  }
  return lines
}

export function proofCount(m: LensModel, domainId: DomainId): number {
  return m.proofs.filter((proof) => proof.domainId === domainId).length
}

export function methodsOf(m: LensModel, domainId: DomainId): MethodId[] {
  const used = new Set(m.proofs.filter((proof) => proof.domainId === domainId).flatMap((proof) => proof.methods))
  return m.methods.map((method) => method.id).filter((id) => used.has(id))
}

export const languageCount = (m: LensModel) => m.materials.filter((material) => material.band === 'language').length

const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  parent?.append(element)
  return element
}

export function svgText(parent: Element, x: number, y: number, text: string, className: string, anchor = 'middle'): SVGTextElement {
  const element = svgEl('text', { x, y, class: className, 'text-anchor': anchor }, parent)
  element.textContent = text
  return element
}

// SVG text never wraps; a label longer than its room (large text settings) is condensed to fit.
export function fitText(text: SVGTextElement, maxWidth: number): SVGTextElement {
  if (text.getComputedTextLength() > maxWidth) {
    text.setAttribute('textLength', String(Math.floor(maxWidth)))
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs')
  }
  return text
}

// HTML inside the decoration layer, for blocks that need text wrapping (tables, command output).
export function htmlBlock(parent: Element, x: number, y: number, w: number, h: number, className: string): HTMLDivElement {
  const holder = svgEl('foreignObject', { x, y, width: w, height: h }, parent)
  const block = document.createElementNS(XHTML_NS, 'div') as HTMLDivElement
  block.className = className
  block.dataset.fit = ''
  holder.append(block)
  return block
}

// Builds HTML with textContent only, so no model label is ever parsed as markup.
export function html(tag: string, className: string, children: (Node | string)[] = []): HTMLElement {
  const element = document.createElementNS(XHTML_NS, tag) as HTMLElement
  if (className) element.className = className
  element.append(...children)
  return element
}

// The lens's group; the stage holds at most one, so two lenses never decorate at once.
export function decoGroup(svg: SVGSVGElement, lens: LensId): SVGGElement {
  return svgEl('g', { 'data-deco': lens }, svg)
}

// Draw-in: the stroke is revealed by dashoffset. fill: backwards only, so a finished animation
// leaves no effect behind and the stroke is the element's own solid line.
export function drawIn(element: SVGGeometryElement, delay: number, duration = DRAW_MS): Animation | null {
  const length = element.getTotalLength()
  if (!(length > 0)) return null
  const dash = `${length} ${length}`
  return element.animate(
    [
      { strokeDasharray: dash, strokeDashoffset: length },
      { strokeDasharray: dash, strokeDashoffset: 0 },
    ],
    { duration, delay, easing: EASE, fill: 'backwards' },
  )
}

export function fadeIn(element: Element, delay: number, duration = 400): Animation {
  return element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing: 'linear', fill: 'backwards' })
}

export const present = <T>(value: T | null): value is T => value !== null
