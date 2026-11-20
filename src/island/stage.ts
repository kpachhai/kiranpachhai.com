// The stage: turns the static domain list into six persistent nodes and drives the lens morph.
// The static <ol> stays the one accessible list of domains; each heading becomes the node button
// and the proof list beneath it stays readable to assistive tech. Decorations are aria-hidden.
//
// One switch runs in three phases: leave fades the old decorations (180 ms), enter moves the
// nodes (800 ms, 50 ms stagger), then the new decorations draw in. Every animation lives under
// the stage box, so a newer switch, a resize or reduced motion can stop all of them at once.
import type { DomainId } from '../model/schema'
import type { IslandData } from './data'
import { el } from './dom'
import { onDrawerChange } from './drawer'
import * as consoleLens from './lenses/console'
import * as indexLens from './lenses/index'
import * as planLens from './lenses/plan'
import * as rangeLens from './lenses/range'
import {
  BREAK_TABLET,
  DRAW_IN_AT,
  EASE,
  FADE_MS,
  MORPH_MS,
  type LayoutOptions,
  type LensModel,
  type LensModule,
  type NodeLayout,
  type StageRect,
  methodsOf,
  proofCount,
  rootRem,
  scaleOf,
} from './lenses/shared'
import { morph, nodeBox } from './morph'
import { onReducedMotionChange, prefersReducedMotion } from './motion'
import { type LensContext, type LensId, currentLens, registerLens } from './state'

// Until the Terrain lens lands, its nodes sit as spot heights on an empty survey ground.
const SUMMITS_WIDE = [[0.16, 0.28], [0.47, 0.19], [0.8, 0.3], [0.3, 0.72], [0.6, 0.6], [0.85, 0.78]]
const SUMMITS_NARROW = [[0.3, 0.08], [0.71, 0.23], [0.3, 0.4], [0.7, 0.55], [0.3, 0.71], [0.7, 0.86]]
const terrainPlaceholder: LensModule = {
  height: (width: number, _m: LensModel, opts?: LayoutOptions) => Math.round((width >= BREAK_TABLET ? 560 : 660) * scaleOf(opts)),
  layout(stage: StageRect, m: LensModel, opts?: LayoutOptions): NodeLayout[] {
    const wide = stage.width >= BREAK_TABLET
    const w = wide ? 184 : 150
    const ground = (wide ? 520 : 600) * scaleOf(opts)
    return m.domains.map((domain, i) => {
      const [fx, fy] = (wide ? SUMMITS_WIDE : SUMMITS_NARROW)[i % 6]
      const cx = Math.max(w / 2 + 8, Math.min(stage.width - w / 2 - 8, fx * stage.width))
      return { domainId: domain.id, x: Math.round(cx - w / 2), y: Math.round(fy * ground), w, h: Math.round(60 * scaleOf(opts)), variant: 'terrain' }
    })
  },
  decorate: () => [],
}

const MODULES: Record<LensId, LensModule> = {
  plan: planLens,
  terrain: terrainPlaceholder,
  console: consoleLens,
  index: indexLens,
  range: rangeLens,
}

let data: IslandData
let stage: HTMLElement
let box: HTMLElement
let svg: SVGSVGElement
let layouts: NodeLayout[] = []
let shown: LensId | null = null
let openDomain: DomainId | null = null
let operation = 0

const settledAll = (animations: Animation[]) =>
  Promise.all(animations.map((animation) => animation.finished.then(() => undefined, () => undefined)))

function running(): Animation[] {
  return box.getAnimations({ subtree: true })
}

// finish jumps to the end state; an endless animation cannot finish, so it is cancelled instead.
export function finishAll(): void {
  for (const animation of running()) {
    try {
      animation.finish()
    } catch {
      animation.cancel()
    }
  }
}

function cancelAll(): void {
  for (const animation of running()) animation.cancel()
}

function measure(): NodeLayout[] {
  const origin = box.getBoundingClientRect()
  return layouts.map((rect) => {
    const now = nodeBox(rect.domainId).getBoundingClientRect()
    return { ...rect, x: now.left - origin.left, y: now.top - origin.top, w: now.width, h: now.height }
  })
}

function sizeDecorations(width: number, height: number): void {
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.replaceChildren()
}

// HTML blocks inside the decorations can wrap taller than estimated; the stage grows to hold them.
function neededHeight(height: number): number {
  let need = height
  for (const block of svg.querySelectorAll<HTMLElement>('[data-fit]')) {
    const holder = block.parentElement
    if (!holder) continue
    const top = Number(holder.getAttribute('y'))
    holder.setAttribute('height', String(Math.max(Number(holder.getAttribute('height')), block.offsetHeight)))
    need = Math.max(need, Math.ceil(top + block.offsetHeight + 16))
  }
  return need
}

function markOpenDomain(): void {
  const methods = openDomain ? methodsOf(data, openDomain) : []
  for (const row of svg.querySelectorAll<HTMLElement>('[data-m]')) row.classList.toggle('on', methods.some((id) => id === row.dataset.m))
}

function draw(lens: LensId, width: number, height: number): Animation[] {
  sizeDecorations(width, height)
  return MODULES[lens].decorate(svg, layouts, data)
}

function render(lens: LensId, requested: boolean): Promise<void> {
  const mine = ++operation
  // The switch's animate flag was decided before leave ran; reduced motion may have been turned on
  // since (during the edge fade), so the preference is read again here, where the morph starts.
  const animate = requested && !prefersReducedMotion()
  const from = animate && shown !== null ? measure() : []
  const fromHeight = box.getBoundingClientRect().height
  cancelAll()
  delete stage.dataset.settled
  const module = MODULES[lens]
  const width = box.clientWidth
  const opts = { rem: rootRem() }
  let height = module.height(width, data, opts)
  layouts = module.layout({ width, height }, data, opts)
  shown = lens
  box.style.height = `${height}px`
  let decorations = draw(lens, width, height)
  const need = neededHeight(height)
  if (need > height) {
    height = need
    box.style.height = `${height}px`
    decorations = draw(lens, width, height)
  }
  markOpenDomain()
  const moved = morph(from, layouts, { reduced: !animate })
  if (!animate) {
    for (const animation of decorations) animation.finish()
    if (currentLens() === lens) stage.dataset.settled = lens
    return Promise.resolve()
  }
  box.animate([{ height: `${fromHeight}px` }, { height: `${height}px` }], { duration: MORPH_MS, easing: EASE })
  for (const animation of decorations) {
    const timing = animation.effect?.getTiming()
    animation.effect?.updateTiming({ delay: DRAW_IN_AT + Number(timing?.delay ?? 0) })
  }
  return Promise.all([moved, settledAll(decorations)]).then(() => {
    if (mine === operation && currentLens() === lens) stage.dataset.settled = lens
  })
}

async function leave(context: LensContext): Promise<void> {
  const mine = ++operation
  delete stage.dataset.settled
  const group = svg.querySelector<SVGGElement>('[data-deco]')
  if (!group) return
  if (!context.animate || prefersReducedMotion()) {
    group.remove()
    return
  }
  for (const animation of group.getAnimations({ subtree: true })) animation.cancel()
  const fade = group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' })
  await fade.finished.catch(() => undefined)
  // A newer enter has already cleared the layer and drawn its own lens; leave it alone.
  if (mine === operation) group.remove()
}

function convertNodes(list: HTMLElement): void {
  data.domains.forEach((domain, position) => {
    const entry = list.querySelector<HTMLElement>(`[data-domain="${domain.id}"]`)
    const heading = entry?.querySelector('h3')
    if (!entry || !heading) throw new Error(`stage: static entry for ${domain.id} is missing`)
    entry.classList.add('node-box')
    entry.style.setProperty('--i', String(position))
    const number = heading.querySelector('.num') ?? el('span', { 'aria-hidden': 'true' }, [String(position + 1).padStart(2, '0')])
    number.classList.add('n-num')
    const count = proofCount(data, domain.id)
    const meta = el('span', { class: 'n-meta', 'aria-hidden': 'true' }, [
      el('span', { class: 'n-count' }, [`${count} ${count === 1 ? 'proof' : 'proofs'}`]),
      el('span', { class: 'n-marks' }, methodsOf(data, domain.id).map((id) => el('i', {}, [id]))),
    ])
    const button = el('button', { type: 'button', class: 'node', 'data-node': domain.id, 'aria-controls': 'drawer', 'aria-expanded': 'false' }, [
      el('span', { class: 'n-tri', 'aria-hidden': 'true' }),
      number,
      el('span', { class: 'n-title' }, [domain.name]),
      meta,
    ])
    heading.replaceChildren(button)
    // The proof list is visually hidden but still read; its links leave the Tab order so focus is never
    // invisible. Keyboard users reach the same links through the node's drawer.
    for (const link of entry.querySelectorAll<HTMLElement>('.proofs a')) link.tabIndex = -1
  })
}

function watchSize(probe: HTMLElement): void {
  let lastWidth = box.clientWidth
  let lastRem = rootRem()
  // The probe is 1rem square, so it reports a root font size change; the box reports width.
  // Height changes are the stage's own and are ignored.
  const observer = new ResizeObserver(() => {
    const width = box.clientWidth
    const rem = rootRem()
    if (Math.abs(width - lastWidth) < 1 && rem === lastRem) return
    lastWidth = width
    lastRem = rem
    // Mid-switch (state already points at the next lens), enter will lay out at the new size.
    if (shown && shown === currentLens()) void render(shown, false)
  })
  observer.observe(probe)
  observer.observe(box)
}

export function initStage(root: HTMLElement, islandData: IslandData): void {
  data = islandData
  stage = root
  const list = stage.querySelector<HTMLElement>('ol.index')
  if (!list) throw new Error('stage: the static domain list is missing')
  convertNodes(list)
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'deco')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const probe = el('span', { class: 'rem-probe', 'aria-hidden': 'true' })
  box = el('div', { class: 'stage-box' })
  list.before(box)
  box.append(svg, list, probe)
  stage.classList.add('lensed')
  watchSize(probe)

  for (const lens of Object.keys(MODULES) as LensId[]) {
    registerLens(lens, { enter: (context) => render(context.to, context.animate), leave })
  }
  // Reduced motion switched on mid-morph: jump every running animation to its end.
  onReducedMotionChange((reduced) => {
    if (reduced) finishAll()
  })
  onDrawerChange((target) => {
    openDomain = target && 'domainId' in target ? target.domainId : null
    markOpenDomain()
  })
}
