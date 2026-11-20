// The proof drawer: one dialog that shows either a domain or a material.
// Nodes are any element carrying data-node="<domainId>"; clicks reach the drawer by delegation,
// so a lens renderer only has to emit those buttons.
import type { DomainId } from '../model/schema'
import type { IslandData, IslandProof } from './data'
import { el } from './dom'
import { popModal, pushModal } from './modal'

export type DrawerTarget = { domainId: DomainId } | { materialId: string }

const BANDS: Record<string, string> = { language: 'Language', tool: 'Tool', discipline: 'Discipline' }
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

let data: IslandData
let drawer: HTMLElement
let title: HTMLElement
let eyebrow: HTMLElement
let body: HTMLElement
let nav: HTMLElement
let shownDomain: DomainId | null = null
let returnTo: HTMLElement | null = null
const openSubscribers = new Set<(target: DrawerTarget | null) => void>()

const pad = (value: number) => String(value).padStart(2, '0')
const proofsOf = (domainId: DomainId) => data.proofs.filter((proof) => proof.domainId === domainId)
// Scoped to the stage so a lens renderer's nodes are found, not a stray copy elsewhere.
const nodeFor = (domainId: string) => document.querySelector<HTMLElement>(`#stage [data-node="${domainId}"]`)

export const isDrawerOpen = () => drawer.classList.contains('open')

export function onDrawerChange(cb: (target: DrawerTarget | null) => void): () => void {
  openSubscribers.add(cb)
  return () => openSubscribers.delete(cb)
}

function section(heading: string, content: HTMLElement): HTMLElement {
  return el('div', { class: 'dr-sec' }, [el('h3', {}, [heading]), content])
}

function proofList(proofs: IslandProof[]): HTMLElement {
  return el(
    'ol',
    { class: 'dr-proofs' },
    proofs.map((proof) => {
      const name = proof.href ? el('a', { href: proof.href }, [proof.label]) : el('b', {}, [proof.label])
      return el('li', {}, [name, el('span', {}, [proof.detail])])
    }),
  )
}

function renderDomain(domainId: DomainId): void {
  const position = data.domains.findIndex((domain) => domain.id === domainId)
  if (position < 0) throw new Error(`openDrawer: unknown domain ${domainId}`)
  const domain = data.domains[position]
  const proofs = proofsOf(domainId)
  const used = new Set(proofs.flatMap((proof) => proof.methods))
  const methods = data.methods.filter((method) => used.has(method.id))

  eyebrow.textContent = `Domain ${pad(position + 1)} of ${pad(data.domains.length)}`
  title.textContent = domain.name
  const parts = [section('Proof', proofList(proofs))]
  if (methods.length > 0) {
    parts.push(
      section(
        'Methods applied',
        el('div', { class: 'dr-chips' }, methods.map((method) => el('span', { class: 'chip' }, [el('i', {}, [method.id]), method.name]))),
      ),
    )
  }
  if (domain.upstream.length > 0) {
    parts.push(
      section(
        'Upstream',
        el(
          'ul',
          { class: 'dr-up' },
          domain.upstream.map((item) =>
            el('li', {}, [el('a', { href: item.href }, [item.label]), el('span', { class: `st-chip ${item.status}` }, [item.statusLabel])]),
          ),
        ),
      ),
    )
  }
  body.replaceChildren(...parts)
  nav.hidden = false
  shownDomain = domainId
}

function renderMaterial(materialId: string): void {
  const material = data.materials.find((item) => item.id === materialId)
  if (!material) throw new Error(`openDrawer: unknown material ${materialId}`)
  const proofs = material.usedIn.map((id) => {
    const proof = data.proofs.find((item) => item.id === id)
    if (!proof) throw new Error(`openDrawer: material ${materialId} names unknown proof ${id}`)
    return proof
  })
  const domains = data.domains.filter((domain) => proofs.some((proof) => proof.domainId === domain.id))

  eyebrow.textContent = BANDS[material.band] ?? material.band
  title.textContent = material.name
  body.replaceChildren(
    section(
      'Domains',
      el(
        'ul',
        { class: 'dr-domains' },
        domains.map((domain) => el('li', {}, [el('button', { type: 'button', class: 'tool', 'data-open-domain': domain.id }, [domain.name])])),
      ),
    ),
    section('Proof', proofList(proofs)),
  )
  nav.hidden = true
  shownDomain = null
}

function syncNodes(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-node]')) {
    node.setAttribute('aria-expanded', String(isDrawerOpen() && node.dataset.node === shownDomain))
  }
}

function rememberReturn(target: DrawerTarget): void {
  const active = document.activeElement
  const node = 'domainId' in target ? nodeFor(target.domainId) : null
  if (active instanceof HTMLElement && active !== document.body && !drawer.contains(active)) returnTo = active
  else if (node) returnTo = node
}

export function openDrawer(target: DrawerTarget): void {
  rememberReturn(target)
  if ('domainId' in target) renderDomain(target.domainId)
  else renderMaterial(target.materialId)
  drawer.classList.add('open')
  pushModal(drawer)
  syncNodes()
  title.focus({ preventScroll: true })
  for (const cb of openSubscribers) cb(target)
}

// Focus goes back to the trigger. A lens renderer may have replaced that node meanwhile, so the
// fallbacks are the current node for the trigger's domain, then the shown domain, then the stage.
function focusTarget(shownId: DomainId | null): HTMLElement | null {
  if (returnTo?.isConnected) return returnTo
  const domainId = returnTo?.dataset.node ?? shownId
  const node = domainId ? nodeFor(domainId) : null
  if (node) return node
  const stage = document.getElementById('stage')
  if (stage && !stage.hasAttribute('tabindex')) stage.setAttribute('tabindex', '-1')
  return stage
}

export function closeDrawer(): void {
  if (!isDrawerOpen()) return
  const target = focusTarget(shownDomain)
  drawer.classList.remove('open')
  popModal(drawer)
  syncNodes()
  shownDomain = null
  target?.focus({ preventScroll: true })
  returnTo = null
  for (const cb of openSubscribers) cb(null)
}

function step(offset: number): void {
  if (!shownDomain) return
  const position = data.domains.findIndex((domain) => domain.id === shownDomain)
  const next = data.domains[(position + offset + data.domains.length) % data.domains.length]
  openDrawer({ domainId: next.id })
}

function trapTab(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const focusables = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.closest('[hidden]'))
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === title)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export function initDrawer(islandData: IslandData): void {
  data = islandData
  const root = document.getElementById('drawer')
  if (!root) throw new Error('initDrawer: #drawer is missing')
  drawer = root
  const find = (selector: string) => {
    const found = root.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`initDrawer: ${selector} is missing`)
    return found
  }
  title = find('#drawer-title')
  eyebrow = find('[data-drawer-eyebrow]')
  body = find('[data-drawer-body]')
  nav = find('[data-drawer-nav]')

  drawer.addEventListener('keydown', trapTab)
  drawer.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-drawer-close]')) closeDrawer()
    const stepButton = target?.closest<HTMLElement>('[data-step]')
    if (stepButton) step(stepButton.dataset.step === 'prev' ? -1 : 1)
    const domainButton = target?.closest<HTMLElement>('[data-open-domain]')
    if (domainButton) openDrawer({ domainId: domainButton.dataset.openDomain as DomainId })
  })
  document.addEventListener('click', (event) => {
    const node = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-node]') : null
    if (!node) return
    const domainId = node.dataset.node as DomainId
    if (isDrawerOpen() && shownDomain === domainId) closeDrawer()
    else {
      returnTo = node
      openDrawer({ domainId })
    }
  })
  // Everything outside is inert while open, so a press anywhere else closes the drawer.
  // preventDefault keeps the press from moving focus off the node closeDrawer just focused.
  document.addEventListener('pointerdown', (event) => {
    if (!isDrawerOpen() || !(event.target instanceof Node) || drawer.contains(event.target)) return
    const palette = document.getElementById('palette')
    if (palette && !palette.hidden) return
    event.preventDefault()
    closeDrawer()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && isDrawerOpen()) {
      event.preventDefault()
      closeDrawer()
    }
  })
}
