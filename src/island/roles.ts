// The hero's role cycle: once per session, the role line steps through the roles actually held,
// then settles back on the standard role line. The titles play in an aria-hidden overlay on top
// of the real line, which keeps its box (so nothing shifts) and stays in the accessibility tree
// the whole time, so a screen reader hears the settled line and no step is announced.
import type { Role } from '../model/schema'
import { EASE, onReducedMotionChange } from './motion'

export const ROLES_KEY = 'kp-roles-seen'
const STEP_MS = 460
const SETTLE_MS = 360

export async function runRoleCycle(el: HTMLElement, roles: Pick<Role, 'title'>[], opts: { reduced: boolean }): Promise<void> {
  const line = el.querySelector<HTMLElement>('.role')
  if (!line) throw new Error('roles: the role line is missing')
  if (opts.reduced || roles.length === 0) return
  const overlay = document.createElement('span')
  overlay.className = 'role-cycle'
  overlay.setAttribute('aria-hidden', 'true')
  el.append(overlay)
  el.dataset.cycling = ''
  let step: Animation | null = null
  let stopped = false
  const off = onReducedMotionChange((reduced) => {
    if (!reduced) return
    stopped = true
    step?.cancel()
  })
  try {
    for (const role of roles) {
      if (stopped) break
      overlay.textContent = role.title
      step = overlay.animate(
        [
          { opacity: 0, transform: 'translateY(0.35em)' },
          { opacity: 1, transform: 'none', offset: 0.25 },
          { opacity: 1, transform: 'none', offset: 0.8 },
          { opacity: 0, transform: 'translateY(-0.35em)' },
        ],
        { duration: STEP_MS, easing: 'linear' },
      )
      await step.finished.catch(() => undefined)
    }
  } finally {
    off()
    overlay.remove()
    delete el.dataset.cycling
  }
  if (!stopped) line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SETTLE_MS, easing: EASE })
}
