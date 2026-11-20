// The lens morph, FLIP style: each node is placed at its new rect at once (Last), then played back
// from where it was (First, Inverted as a translate) to rest. Width and height interpolate rather
// than scale, so labels reflow instead of stretching. Timings come from the global motion contract.
import { EASE, MORPH_MS, STAGGER_MS, type NodeLayout } from './lenses/shared'

export function nodeBox(domainId: string): HTMLElement {
  const box = document.querySelector<HTMLElement>(`#stage [data-domain="${domainId}"]`)
  if (!box) throw new Error(`morph: no node for ${domainId}`)
  return box
}

export function place(element: HTMLElement, rect: NodeLayout): void {
  element.style.left = `${rect.x}px`
  element.style.top = `${rect.y}px`
  element.style.width = `${rect.w}px`
  element.style.height = `${rect.h}px`
}

const same = (a: NodeLayout, b: NodeLayout) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5

// Resolves when every node is at rest, whether its animation finished or was cancelled by a newer switch.
export function morph(from: NodeLayout[], to: NodeLayout[], opts: { reduced: boolean }): Promise<void> {
  const moves: Animation[] = []
  to.forEach((target, position) => {
    const element = nodeBox(target.domainId)
    place(element, target)
    const start = from.find((rect) => rect.domainId === target.domainId)
    if (opts.reduced || !start || same(start, target)) return
    moves.push(
      element.animate(
        [
          { transform: `translate(${start.x - target.x}px, ${start.y - target.y}px)`, width: `${start.w}px`, height: `${start.h}px` },
          { transform: 'translate(0px, 0px)', width: `${target.w}px`, height: `${target.h}px` },
        ],
        // fill: backwards holds the start rect through the stagger delay and leaves nothing behind after.
        { duration: MORPH_MS, delay: position * STAGGER_MS, easing: EASE, fill: 'backwards' },
      ),
    )
  })
  return Promise.all(moves.map((move) => move.finished.then(() => undefined, () => undefined))).then(() => undefined)
}
