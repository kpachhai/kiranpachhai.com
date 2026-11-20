// The signature intro: the Plan drawing replayed as an exploded assembly, about 3.5 s, once per
// session, only when the visit starts on Plan with reduced motion off. The settled drawing is
// already on the page before it starts, so the hero and the static content paint first.
//   0-400 ms      the frame and grid draw; the hub appears
//   400-1800 ms   the six items and the four language parts travel along dashed axes and seat
//   1800-2600 ms  balloon callouts draw to each item's lead proof
//   2600-3500 ms  the bill of materials draws in: languages first, then tools and disciplines
//   3300-3900 ms  the lens switcher pulses once
// Every animation is fill: backwards, so cancelling one leaves its element exactly as the settled
// drawing has it. Stopping the intro is cancelling all of them and removing the axes.
import { isTyping } from './dom'
import type { IntroPhase } from './lenses/plan'
import { EASE, type NodeLayout, svgEl } from './lenses/shared'
import { onModalOpen } from './modal'
import { nodeBox } from './morph'
import { onReducedMotionChange, prefersReducedMotion } from './motion'
import { finishAll, nodeLayouts, redraw } from './stage'
import { currentLens, lensForKey, markSeenThisSession, onLensChange, seenThisSession, setLens, shortcutsEnabled } from './state'

export const INTRO_KEY = 'kp-intro-seen'

type Box = { x: number; y: number; w: number; h: number }
type Offset = { dx: number; dy: number; r: number }

// Where each phase of the Plan draw-in lands on the intro clock, from its authored delay.
const RETIME: Record<IntroPhase, (delay: number) => number> = {
  frame: (delay) => delay,
  hub: () => 120,
  wire: (delay) => delay + 1350,
  callout: (delay) => delay + 1500,
  dim: (delay) => delay + 1650,
  sheet: (delay) => delay + 1650,
}
const NODE_AT = 400
const PART_AT = 640
const BOM_AT = 2600
const LATER_BANDS_AT = 2950
const PULSE_AT = 3300

function requireElement<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`intro: ${selector} is missing`)
  return found
}

const boxOf = (rect: Element): Box => ({
  x: Number(rect.getAttribute('x')),
  y: Number(rect.getAttribute('y')),
  w: Number(rect.getAttribute('width')),
  h: Number(rect.getAttribute('height')),
})
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const centreOf = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })

function retime(animation: Animation): Animation {
  const target = (animation.effect as KeyframeEffect | null)?.target
  const phase = target?.closest<SVGElement | HTMLElement>('[data-phase]')?.dataset.phase as IntroPhase | undefined
  const delay = Number(animation.effect?.getTiming().delay ?? 0)
  if (phase) animation.effect?.updateTiming({ delay: RETIME[phase](delay) })
  return animation
}

// Wide sheets explode outward from the hub; phones explode along the vertical axis only.
function offsets(nodes: NodeLayout[], hub: Box, parts: number, wide: boolean): { nodes: Offset[]; parts: Offset[] } {
  if (!wide) {
    return {
      nodes: nodes.map((_, i) => ({ dx: 0, dy: 64 + Math.floor(i / 2) * 22, r: i % 2 ? 1.2 : -1.2 })),
      parts: Array.from({ length: parts }, (_, k) => ({ dx: 0, dy: 70 + k * 14, r: 0 })),
    }
  }
  const hc = centreOf(hub)
  // Parts stay inside the drawing, so nothing flies over the revision table beside it.
  const right = Math.max(...nodes.map((node) => node.x + node.w)) + 22
  const half = parts / 2
  return {
    nodes: nodes.map((node, i) => {
      const vx = node.x + node.w / 2 - hc.x
      const vy = node.y + node.h / 2 - hc.y
      const length = Math.hypot(vx, vy) || 1
      return { dx: clamp((vx / length) * 80, 8 - node.w * 0.25 - node.x, right - node.w - node.x), dy: (vy / length) * 105, r: i % 2 ? 2.2 : -2.2 }
    }),
    parts: Array.from({ length: parts }, (_, k) =>
      k < half ? { dx: -(170 + (half - 1 - k) * 70), dy: -26, r: -1.5 } : { dx: 170 + (k - half) * 70, dy: 26, r: 1.5 },
    ),
  }
}

function axes(svg: SVGSVGElement, nodes: NodeLayout[], hub: Box, parts: Box[], moves: ReturnType<typeof offsets>, wide: boolean): SVGGElement {
  const group = svgEl('g', { 'data-intro-axes': '', class: 'axes' }, svg)
  // Endpoints stay inside the sheet frame (inset 6 px), so no axis runs past the drawing.
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  const at = (x: number, y: number) => `${clamp(x, 6, width - 6).toFixed(1)} ${clamp(y, 6, height - 6).toFixed(1)}`
  const line = (x1: number, y1: number, x2: number, y2: number) => svgEl('path', { d: `M${at(x1, y1)}L${at(x2, y2)}`, class: 'ax' }, group)
  const hc = centreOf(hub)
  nodes.forEach((node, i) => {
    const c = centreOf(node)
    const move = moves.nodes[i]
    const from = wide ? hc : { x: c.x, y: node.y - 4 }
    line(from.x, from.y, c.x + move.dx * 1.4, c.y + move.dy * 1.4)
  })
  if (wide && parts.length > 0) {
    const first = parts[0]
    const last = parts[parts.length - 1]
    const y = first.y + first.h / 2
    const a = moves.parts[0]
    const b = moves.parts[parts.length - 1]
    line(first.x + a.dx - 20, y + a.dy, last.x + last.w + b.dx + 20, y + b.dy)
  } else {
    parts.forEach((part, k) => {
      const x = part.x + part.w / 2
      line(x, part.y + part.h, x, part.y + part.h + moves.parts[k].dy * 1.3)
    })
  }
  return group
}

const travel = (move: Offset) => `translate(${move.dx.toFixed(1)}px, ${move.dy.toFixed(1)}px) rotate(${move.r}deg)`

function seat(element: Element, move: Offset, delay: number, duration: number): Animation {
  const from = travel(move)
  return element.animate(
    [
      { transform: from, opacity: 0 },
      { transform: from, opacity: 1, offset: 0.16, easing: EASE },
      { transform: 'none', opacity: 1 },
    ],
    { duration, delay, easing: 'linear', fill: 'backwards' },
  )
}

function billOfMaterials(bom: HTMLElement): Animation[] {
  const reveal = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]
  const animations = [
    bom.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: BOM_AT, easing: EASE, fill: 'backwards' }),
  ]
  bom.querySelectorAll('[data-band="language"] li').forEach((row, k) => {
    animations.push(row.animate(reveal, { duration: 420, delay: BOM_AT + 50 + k * 70, easing: EASE, fill: 'backwards' }))
  })
  bom.querySelectorAll('[data-band]:not([data-band="language"]) .bom-band-h').forEach((heading) => {
    animations.push(heading.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: LATER_BANDS_AT - 50, easing: 'linear', fill: 'backwards' }))
  })
  bom.querySelectorAll('[data-band]:not([data-band="language"]) li').forEach((row, j) => {
    animations.push(row.animate(reveal, { duration: 300, delay: LATER_BANDS_AT + j * 25, easing: EASE, fill: 'backwards' }))
  })
  return animations
}

function pulse(switcher: HTMLElement): Animation {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'currentColor'
  const ring = `0 0 0 4px color-mix(in srgb, ${accent} 38%, transparent)`
  return switcher.animate([{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: ring }, { boxShadow: '0 0 0 0 transparent' }], {
    duration: 600,
    delay: PULSE_AT,
    easing: 'ease-in-out',
  })
}

function assemble(stage: HTMLElement): { animations: Animation[]; axes: SVGGElement } {
  const animations = redraw().map(retime)
  const svg = requireElement<SVGSVGElement>('#stage svg.deco')
  const hub = boxOf(requireElement('#stage [data-hub]'))
  const parts = [...svg.querySelectorAll<SVGGElement>('[data-part]')]
  const partBoxes = parts.map((part) => boxOf(part.querySelector('rect') ?? part))
  const nodes = nodeLayouts()
  const wide = nodes.length > 1 && nodes[0].y === nodes[1].y && nodes[1].y === nodes[2]?.y
  const moves = offsets(nodes, hub, parts.length, wide)
  const lines = axes(svg, nodes, hub, partBoxes, moves, wide)
  animations.push(
    lines.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], {
      duration: 1900,
      delay: NODE_AT - 20,
      easing: 'linear',
      fill: 'both',
    }),
  )
  nodes.forEach((node, i) => animations.push(seat(nodeBox(node.domainId), moves.nodes[i], NODE_AT + i * 60, 1150)))
  parts.forEach((part, k) => animations.push(seat(part, moves.parts[k], PART_AT + k * 60, 1000)))
  animations.push(...billOfMaterials(requireElement<HTMLElement>('#stage .bom')))
  animations.push(pulse(requireElement<HTMLElement>('.bar .lenses')))
  stage.dataset.intro = 'play'
  return { animations, axes: lines }
}

const canFocus = (element: HTMLElement | null): element is HTMLElement =>
  element !== null && element.isConnected && element.getClientRects().length > 0 && !element.closest('[inert]') && !element.matches(':disabled')

// Skip is about to hide: a keyboard user on it lands on Replay, or on the first Plan node when
// Replay is not shown (reduced motion). If neither can take focus, the stage itself does.
function handOffFocus(replay: HTMLElement): void {
  for (const target of [replay, document.querySelector<HTMLElement>('#stage [data-node]')]) {
    if (!canFocus(target)) continue
    target.focus({ preventScroll: true })
    if (document.activeElement === target) return
  }
  const stage = requireElement<HTMLElement>('#stage')
  if (!stage.hasAttribute('tabindex')) stage.tabIndex = -1
  stage.focus({ preventScroll: true })
}

// Resolves once the intro has ended, whether it ran out or was stopped through the signal.
export function runIntro(opts: { reduced: boolean; signal: AbortSignal }): Promise<void> {
  if (opts.reduced || opts.signal.aborted || currentLens() !== 'plan') return Promise.resolve()
  const stage = requireElement<HTMLElement>('#stage')
  const skip = requireElement<HTMLButtonElement>('#intro-skip')
  const replay = requireElement<HTMLButtonElement>('#intro-replay')
  markSeenThisSession(INTRO_KEY)
  delete stage.dataset.settled
  const { animations, axes: lines } = assemble(stage)
  skip.hidden = false
  return new Promise((resolve) => {
    let over = false
    // The stage redraws on its own when the root font size or zoom changes; that clears the axes,
    // and the intro ends with them rather than running on beside a fresh drawing.
    const redrawn = new MutationObserver(() => {
      if (!lines.isConnected) end()
    })
    const end = () => {
      if (over) return
      over = true
      redrawn.disconnect()
      opts.signal.removeEventListener('abort', end)
      for (const animation of animations) animation.cancel()
      lines.remove()
      delete stage.dataset.intro
      if (document.activeElement === skip) handOffFocus(replay)
      skip.hidden = true
      if (currentLens() === 'plan' && stage.dataset.lens === 'plan') stage.dataset.settled = 'plan'
      resolve()
    }
    opts.signal.addEventListener('abort', end)
    if (lines.parentNode) redrawn.observe(lines.parentNode, { childList: true })
    void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(end)
  })
}

// Wires the Skip and Replay controls and everything that cancels the intro: a lens switch from
// any path, a press of 1 to 5, the palette or the drawer opening, a width change, reduced motion.
export function initIntro(): void {
  const skip = requireElement<HTMLButtonElement>('#intro-skip')
  const replay = requireElement<HTMLButtonElement>('#intro-replay')
  const stage = requireElement<HTMLElement>('#stage')
  let controller: AbortController | null = null

  const stop = () => {
    controller?.abort()
    controller = null
  }
  const play = async () => {
    stop()
    const mine = new AbortController()
    controller = mine
    await runIntro({ reduced: prefersReducedMotion(), signal: mine.signal })
    if (controller === mine) controller = null
  }

  // Capture phase, so the intro is gone before the lens code sees the same key or click.
  window.addEventListener(
    'keydown',
    (event) => {
      // Only a press that switches the lens ends the intro: not with shortcuts off, not while typing.
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || !shortcutsEnabled()) return
      if (lensForKey(event)) stop()
    },
    true,
  )
  document.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('[data-lens-button]')) stop()
    },
    true,
  )
  window.addEventListener('hashchange', stop)
  let width = window.innerWidth
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return
    width = window.innerWidth
    stop()
  })
  onModalOpen(stop)
  onLensChange(stop)
  onReducedMotionChange((reduced) => {
    if (reduced) stop()
  })

  // The intro's end hands focus on when Skip had it; a browser that does not focus a clicked
  // button leaves focus on the page, and Replay takes it there too.
  skip.addEventListener('click', () => {
    stop()
    if (document.activeElement === document.body) handOffFocus(replay)
  })
  replay.addEventListener('click', async () => {
    stop()
    if (currentLens() !== 'plan') await setLens('plan', { animate: false })
    // Mid-morph into Plan: end the morph and let its settle mark land before the intro takes over.
    if (stage.dataset.settled !== 'plan') {
      finishAll()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (currentLens() === 'plan') await play()
  })

  if (currentLens() === 'plan' && !prefersReducedMotion() && !seenThisSession(INTRO_KEY)) void play()
}
