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
  DRAW_IN_AT,
  EASE,
  FADE_MS,
  MORPH_MS,
  type LayoutOptions,
  type LensModule,
  type NodeLayout,
  isLensModule,
  methodsOf,
  proofCount,
  rootRem,
} from './lenses/shared'
import { morph, nodeBox } from './morph'
import { onReducedMotionChange, prefersReducedMotion } from './motion'
import { DEFAULT_LENS, LENSES, type LensContext, type LensId, currentLens, registerLens, setLens } from './state'

// Terrain is the one lens loaded on first use, so the initial route never carries its code.
const MODULES: Partial<Record<LensId, LensModule>> = {
  plan: planLens,
  console: consoleLens,
  index: indexLens,
  range: rangeLens,
}
const LAZY: Partial<Record<LensId, () => Promise<LensModule>>> = {
  terrain: () => import('./lenses/terrain'),
}

let data: IslandData
let stage: HTMLElement
let box: HTMLElement
let svg: SVGSVGElement
let layouts: NodeLayout[] = []
let shown: LensId | null = null
let openDomain: DomainId | null = null
let operation = 0
let releaseShown: (() => void) | null = null
// The layout options the shown lens was laid out with; its decorations are drawn with the same ones.
let shownOpts: LayoutOptions = { rem: 16 }

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

// For the intro: the node rects of the shown lens, and a fresh draw-in of its decorations with the
// animations still running, so the intro can retime them. The nodes stay where they are.
export function nodeLayouts(): NodeLayout[] {
  return layouts.map((rect) => ({ ...rect }))
}

export function redraw(): Animation[] {
  if (!shown) return []
  const height = parseFloat(box.style.height)
  const animations = draw(shown, box.clientWidth, height)
  neededHeight(height)
  markOpenDomain()
  return animations
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

// Clears the decoration layer and anything a lens drew beside it.
function clearDecorations(): void {
  releaseShown?.()
  releaseShown = null
  svg.replaceChildren()
}

function sizeDecorations(width: number, height: number): void {
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clearDecorations()
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

function moduleOf(lens: LensId): LensModule {
  const module = MODULES[lens]
  if (!module) throw new Error(`stage: lens ${lens} is not loaded`)
  return module
}

function draw(lens: LensId, width: number, height: number): Animation[] {
  sizeDecorations(width, height)
  const module = moduleOf(lens)
  releaseShown = module.release ?? null
  return module.decorate(svg, layouts, data, shownOpts)
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
  const module = moduleOf(lens)
  const width = box.clientWidth
  const opts = { rem: rootRem() }
  let height = module.height(width, data, opts)
  layouts = module.layout({ width, height }, data, opts)
  shownOpts = opts
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
  // The draw-in waits for the nodes to settle; when none moves (A to B to A inside the fade), it starts at once.
  const anyMove = layouts.some((rect) => nodeBox(rect.domainId).getAnimations().length > 0)
  const drawInAt = anyMove ? DRAW_IN_AT : 0
  for (const animation of decorations) {
    const timing = animation.effect?.getTiming()
    animation.effect?.updateTiming({ delay: drawInAt + Number(timing?.delay ?? 0) })
  }
  return Promise.all([moved, settledAll(decorations)]).then(() => {
    if (mine === operation && currentLens() === lens) stage.dataset.settled = lens
  })
}

async function leave(context: LensContext): Promise<void> {
  const mine = ++operation
  delete stage.dataset.settled
  // The lens's SVG group plus any canvas it drew beside the layer fade out together.
  const layers: Element[] = [...svg.querySelectorAll('[data-deco]'), ...box.querySelectorAll(':scope > canvas')]
  if (!context.animate || prefersReducedMotion() || layers.length === 0) {
    clearDecorations()
    return
  }
  // Pausing (not cancelling) holds a half-drawn line where it is while it fades; a cancelled
  // draw-in would jump to the full stroke first.
  const held = layers.flatMap((layer) => layer.getAnimations({ subtree: true }))
  for (const animation of held) animation.pause()
  const fades = layers.map((layer) => layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' }))
  await settledAll(fades)
  // Faded out, the held animations are cancelled so whatever waits on them settles.
  for (const animation of held) animation.cancel()
  // A newer enter has already cleared the layer and drawn its own lens; leave it alone.
  if (mine === operation) clearDecorations()
}

// Re-lays the shown lens in place (the Range view toggle) with the same fade, morph and draw-in
// as a lens switch. A newer relayout or a lens switch that starts during the fade wins, so fast
// presses draw the lens once, for the last choice.
let relayouts = 0

export async function relayout(): Promise<void> {
  const lens = shown
  if (!lens || lens !== currentLens()) return
  const mine = ++relayouts
  const animate = !prefersReducedMotion()
  await leave({ stage, from: lens, to: lens, animate })
  if (mine !== relayouts || currentLens() !== lens) return
  await render(lens, animate)
}

// A lens not yet loaded keeps the stage as it is (same height, nodes where they stand) and marks
// it busy until its module arrives. One load runs per lens however often it is asked for; only
// the newest enter may draw once it resolves.
const loading: Partial<Record<LensId, Promise<LensModule>>> = {}
const failedUrl: Partial<Record<LensId, string>> = {}
let entering = 0
let retries = 0

// Browsers keep a failed module fetch in their module map, so importing the same URL again rejects
// without a request. Chromium and Firefox name the chunk in the error; WebKit does not, so its URL
// comes from the page's modulepreload link. A retry imports that same-origin URL with a fresh
// query. Without a URL the plain import is tried again.
// A message whose URL does not parse yields no URL, so the caller's revert always runs.
export function chunkUrlOf(error: unknown, origin: string): string | undefined {
  // A built chunk is .js; the dev server serves the source module (.ts) under the same scheme.
  const match = (error instanceof Error ? error.message : String(error)).match(/https?:\/\/[^\s'"]+?\.(?:[cm]?js|tsx?)\b/)
  if (!match) return undefined
  try {
    const url = new URL(match[0])
    return url.origin === origin ? `${url.origin}${url.pathname}` : undefined
  } catch {
    return undefined
  }
}

// WebKit names no URL in the error. The chunk is still on the page as the modulepreload link the
// bundler's preload helper added for it, named after the lens module.
export function chunkUrlFromPreloads(hrefs: string[], lens: LensId, origin: string): string | undefined {
  for (const href of hrefs) {
    try {
      const url = new URL(href, origin)
      if (url.origin === origin && new RegExp(`/${lens}\\.[^/]*\\.js$`).test(url.pathname)) return `${url.origin}${url.pathname}`
    } catch {
      // Not a URL: not the chunk.
    }
  }
  return undefined
}

const preloadHrefs = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((link) => link.href)

async function loadLens(lens: LensId, load: () => Promise<LensModule>): Promise<LensModule> {
  const url = failedUrl[lens]
  const loaded: unknown = url ? await import(/* @vite-ignore */ `${url}?retry=${++retries}`) : await load()
  if (!isLensModule(loaded)) throw new Error(`stage: the ${lens} module has no lens API`)
  return loaded
}
const LOAD_FAILED = 'Terrain view could not load.'

async function enter(context: LensContext): Promise<void> {
  const lens = context.to
  const mine = ++entering
  if (MODULES[lens]) {
    // A newer, loaded lens ends any busy state an older load left behind.
    stage.removeAttribute('aria-busy')
    return render(lens, context.animate)
  }
  const load = LAZY[lens]
  if (!load) throw new Error(`stage: no module for lens ${lens}`)
  stage.setAttribute('aria-busy', 'true')
  // While the module loads, the stage keeps the look of the lens it still shows; the controls
  // already name the new lens. data-lens moves on once the lens can draw.
  if (context.from && context.from !== lens) stage.dataset.lens = context.from
  try {
    MODULES[lens] = await (loading[lens] ??= loadLens(lens, load))
  } catch (error) {
    // Forget the failed load so the next press tries again.
    delete loading[lens]
    failedUrl[lens] ??= chunkUrlOf(error, window.location.origin) ?? chunkUrlFromPreloads(preloadHrefs(), lens, window.location.origin)
    if (mine !== entering) return
    stage.removeAttribute('aria-busy')
    if (currentLens() === lens) await revert(context, error)
    return
  }
  if (mine !== entering) return
  stage.removeAttribute('aria-busy')
  if (currentLens() !== lens) return
  stage.dataset.lens = lens
  return render(lens, context.animate)
}

// The lens that could not load is undone through state, so the controls, the hash, data-lens and
// the decorations all return to the lens shown before it; then the live region says why, once.
async function revert(context: LensContext, error: unknown): Promise<void> {
  console.error(`stage: the ${context.to} lens failed to load`, error)
  const back = context.from && context.from !== context.to ? context.from : DEFAULT_LENS
  await setLens(back, { animate: false })
  const live = document.getElementById('island-live')
  if (live) live.textContent = LOAD_FAILED
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

  for (const lens of LENSES) registerLens(lens, { enter, leave })
  // Reduced motion switched on mid-morph: jump every running animation to its end.
  onReducedMotionChange((reduced) => {
    if (reduced) finishAll()
  })
  onDrawerChange((target) => {
    openDomain = target && 'domainId' in target ? target.domainId : null
    markOpenDomain()
  })
}
