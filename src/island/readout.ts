// The readout under the sheet, in the console's voice. At rest it prints `kp map`: the areas as a
// tree, one button each. A chosen area lists its proofs, methods and upstream rows; a chosen
// material lists its proofs and the areas that use them. It is part of the page, not a dialog, so
// nothing goes inert while it shows something. Esc returns to the tree and puts focus back on the
// summit (or the materials row) for what was shown.
import type { DomainId } from '../model/schema'
import type { SourceLabel } from '../lib/provenance'
import type { IslandData, IslandProof } from './data'
import { el } from './dom'
import { pad, proofCount } from './format'
import { prefersReducedMotion } from './motion'

export type Shown = { domainId: DomainId } | { materialId: string }

const BANDS: Record<string, string> = { language: 'Language', stack: 'Framework or stack', tool: 'Platform or tool', discipline: 'Discipline' }

let data: IslandData
let readout: HTMLElement
let live: HTMLElement
let shown: Shown | null = null
let announcing = 0
const subscribers = new Set<(shown: Shown | null) => void>()

// The attribute the sheet gives each materials row's button, naming its material.
export const MATERIAL_OPEN = 'data-material-open'

const proofsOf = (domainId: DomainId) => data.proofs.filter((proof) => proof.domainId === domainId)

export function onReadoutChange(cb: (shown: Shown | null) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

// Whatever is shown next replaces a step's pending announcement, which would otherwise land late.
function show(next: Shown | null, parts: HTMLElement[]): void {
  window.cancelAnimationFrame(announcing)
  readout.replaceChildren(...parts)
  shown = next
  for (const cb of subscribers) cb(shown)
}

function commandLine(command: string): HTMLElement {
  return el('p', { class: 'ro-cmd' }, [el('span', { class: 'ps', 'aria-hidden': 'true' }, ['$']), ` ${command}`])
}

function heading(text: string): HTMLElement {
  return el('h3', { id: 'readout-h', tabindex: '-1' }, [text])
}

function section(title: string, content: HTMLElement): HTMLElement {
  return el('div', { class: 'ro-sec' }, [el('h4', {}, [title]), content])
}

// The same source label SourceTag.astro renders, shown only while the provenance toggle is on.
function sourceTag(label: SourceLabel): HTMLElement {
  return el('span', { class: 'src-tag', 'data-claim-source': '', 'data-source-kind': label.kind }, [
    label.href ? el('a', { href: label.href }, [label.text]) : label.text,
  ])
}

function proofMeta(proof: IslandProof): string {
  const parts = [proof.modes.join(', '), proof.methods.length > 0 ? `methods ${proof.methods.join(' ')}` : '']
  return parts.filter((part) => part !== '').join(' / ')
}

function proofList(proofs: IslandProof[]): HTMLElement {
  return el(
    'ol',
    { class: 'ro-proofs' },
    proofs.map((proof) =>
      el('li', { 'data-claim-id': `readout-proof-${proof.id}` }, [
        el('span', { class: 'ro-pname' }, [el('span', { 'aria-hidden': 'true' }, ['> ']), proof.href ? el('a', { href: proof.href }, [proof.label]) : proof.label]),
        el('span', { class: 'ro-modes' }, [proofMeta(proof)]),
        el('span', { class: 'ro-detail' }, [proof.detail]),
        sourceTag(proof.source),
      ]),
    ),
  )
}

function treeLine(domainId: DomainId, position: number, name: string): HTMLElement {
  return el('li', {}, [
    el('button', { type: 'button', 'data-readout-area': domainId }, [
      el('span', { class: 'ro-no' }, [pad(position + 1)]),
      el('span', { class: 'ro-name' }, [name]),
      el('span', { class: 'ro-count' }, [proofCount(proofsOf(domainId).length)]),
    ]),
  ])
}

export function showTree(): void {
  show(null, [
    commandLine('kp map'),
    heading(`${data.domains.length} areas / ${data.proofs.length} proofs / select one`),
    el('ul', { class: 'ro-tree' }, data.domains.map((domain, position) => treeLine(domain.id, position, domain.name))),
  ])
}

function upstreamList(domainId: DomainId): HTMLElement | null {
  const domain = data.domains.find((item) => item.id === domainId)
  if (!domain || domain.upstream.length === 0) return null
  return el(
    'ul',
    { class: 'ro-up' },
    domain.upstream.map((item) =>
      el('li', {}, [
        el('a', { href: item.href }, [item.label]),
        el('span', { class: 'ro-st' }, item.statuses.map(({ status, label }) => el('span', { class: `st-chip ${status}` }, [label]))),
        ...(item.links.length > 0 ? [el('ul', { class: 'ro-pins' }, item.links.map((link) => el('li', {}, [el('a', { href: link.href }, [link.note])])))] : []),
      ]),
    ),
  )
}

function methodChips(methodIds: Set<string>): HTMLElement | null {
  const methods = data.methods.filter((method) => methodIds.has(method.id))
  if (methods.length === 0) return null
  return el('div', { class: 'ro-chips' }, methods.map((method) => el('span', { class: 'ro-chip', 'data-method': method.id }, [el('i', {}, [method.id]), method.name])))
}

function areaNav(): HTMLElement {
  return el('div', { class: 'ro-nav' }, [
    el('button', { type: 'button', class: 'tool', 'data-step': 'prev' }, ['Previous area']),
    el('button', { type: 'button', class: 'tool', 'data-step': 'next' }, ['Next area']),
    el('button', { type: 'button', class: 'tool', 'data-readout-back': '' }, ['Back to the map']),
  ])
}

function areaParts(domainId: DomainId): HTMLElement[] {
  const position = data.domains.findIndex((domain) => domain.id === domainId)
  if (position < 0) throw new Error(`readout: unknown area ${domainId}`)
  const proofs = proofsOf(domainId)
  const used = new Set<string>(proofs.flatMap((proof) => proof.methods))
  const letters = data.methods.filter((method) => used.has(method.id)).map((method) => method.id)
  const out = [`Area ${pad(position + 1)} of ${pad(data.domains.length)}`, proofCount(proofs.length), ...(letters.length > 0 ? [`methods ${letters.join(' ')}`] : [])]
  const chips = methodChips(used)
  const upstream = upstreamList(domainId)
  return [
    commandLine(`kp open ${domainId}`),
    heading(data.domains[position].name),
    el('p', { class: 'ro-out' }, [out.join(' / ')]),
    section('Proof', proofList(proofs)),
    ...(chips ? [section('Methods applied', chips)] : []),
    ...(upstream ? [section('Upstream', upstream)] : []),
    areaNav(),
  ]
}

function materialParts(materialId: string): HTMLElement[] {
  const material = data.materials.find((item) => item.id === materialId)
  if (!material) throw new Error(`readout: unknown material ${materialId}`)
  const proofs = material.usedIn.map((id) => {
    const proof = data.proofs.find((item) => item.id === id)
    if (!proof) throw new Error(`readout: material ${materialId} names unknown proof ${id}`)
    return proof
  })
  const areas = data.domains.filter((domain) => proofs.some((proof) => proof.domainId === domain.id))
  return [
    commandLine(`kp open ${material.id}`),
    heading(material.name),
    el('p', { class: 'ro-out', 'data-claim-id': `readout-material-${material.id}` }, [`${BANDS[material.band] ?? material.band} / ${proofCount(proofs.length)}`, sourceTag(material.source)]),
    section('Areas', el('ul', { class: 'ro-areas' }, areas.map((domain) => el('li', {}, [el('button', { type: 'button', class: 'tool', 'data-open-domain': domain.id }, [domain.name])])))),
    section('Proof', proofList(proofs)),
    el('div', { class: 'ro-nav' }, [el('button', { type: 'button', class: 'tool', 'data-readout-back': '' }, ['Back to the map'])]),
  ]
}

// Focus moves to the heading, which a screen reader reads; the readout scrolls only as far as it
// must to be seen, since it sits under the sheet.
function focusHeading(): void {
  const title = readout.querySelector<HTMLElement>('#readout-h')
  if (!title) throw new Error('readout: #readout-h is missing')
  title.focus({ preventScroll: true })
  readout.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

// A live region written the text it already holds may not be read again, so it is cleared first and
// the message lands two frames later, once the empty region has been painted.
function announce(message: string): void {
  window.cancelAnimationFrame(announcing)
  live.textContent = ''
  announcing = window.requestAnimationFrame(() => {
    announcing = window.requestAnimationFrame(() => {
      live.textContent = message
    })
  })
}

// An area shown without moving focus (a step) is announced instead.
export function showArea(domainId: DomainId, opts: { focus?: boolean } = {}): void {
  show({ domainId }, areaParts(domainId))
  if (opts.focus) focusHeading()
  else announce(`Showing ${data.domains.find((domain) => domain.id === domainId)?.name ?? domainId}`)
}

export function showMaterial(materialId: string): void {
  show({ materialId }, materialParts(materialId))
  focusHeading()
}

// A step keeps focus on the button pressed, so the reader can step again.
function step(direction: 'prev' | 'next'): void {
  if (!shown || !('domainId' in shown)) return
  const current = shown.domainId
  const position = data.domains.findIndex((domain) => domain.id === current)
  const offset = direction === 'prev' ? -1 : 1
  showArea(data.domains[(position + offset + data.domains.length) % data.domains.length].id)
  readout.querySelector<HTMLElement>(`[data-step="${direction}"]`)?.focus({ preventScroll: true })
}

// The summit or materials row for what was shown, remembered by id: WebKit does not focus a
// clicked link, so the element that had focus cannot be trusted to be the opener.
function originOf(target: Shown): HTMLElement | null {
  const selector = 'domainId' in target ? `#sheet a.summit[data-summit="${target.domainId}"]` : `#sheet [${MATERIAL_OPEN}="${target.materialId}"]`
  return document.querySelector<HTMLElement>(selector)
}

function backToMap(): void {
  if (!shown) return
  const origin = originOf(shown)
  showTree()
  origin?.focus()
}

function onClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const area = target?.closest<HTMLElement>('[data-readout-area]')?.dataset.readoutArea ?? target?.closest<HTMLElement>('[data-open-domain]')?.dataset.openDomain
  if (area) showArea(area as DomainId, { focus: true })
  const stepButton = target?.closest<HTMLElement>('[data-step]')
  if (stepButton) step(stepButton.dataset.step === 'prev' ? 'prev' : 'next')
  if (target?.closest('[data-readout-back]')) backToMap()
}

// Esc counts only while focus is on the sheet, so a press elsewhere on the page never pulls the
// reader back up to it. Every control that shows something leaves focus on the sheet (the heading,
// a step button or the opener), even in WebKit, which does not focus a clicked button or link.
function onEscape(sheet: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || !shown) return
  if (!sheet.contains(document.activeElement)) return
  event.preventDefault()
  backToMap()
}

export function initReadout(islandData: IslandData): void {
  data = islandData
  const root = document.getElementById('readout')
  const region = document.getElementById('island-live')
  const sheet = document.getElementById('sheet')
  if (!root || !region || !sheet) throw new Error('initReadout: #readout, #island-live or #sheet is missing')
  readout = root
  live = region
  readout.addEventListener('click', onClick)
  document.addEventListener('keydown', (event) => onEscape(sheet, event))
  showTree()
}
