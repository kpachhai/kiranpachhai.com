// The sheet's controls. Without JavaScript each summit links to its area in the static list under
// the sheet and the materials rows are text. With it, that list is hidden: a summit or a materials
// row shows its detail in the readout, the summit for the area shown is marked current, the command
// line types the matching `kp open` and opens search, the methods table lights its trails, and URL
// hashes from the old lenses or the static list land on the sheet.
import type { DomainId } from '../model/schema'
import type { IslandData } from './data'
import { el } from './dom'
import { prefersReducedMotion } from './motion'
import { openPalette } from './palette'
import { initReadout, onReadoutChange, showArea, showMaterial, type Shown } from './readout'

const COMMAND = 'kp open'
const TYPE_MS = 35
// The lenses the sheet replaced: the lens site wrote #lens-<id>, and older links use the bare names.
// #lens-range lands on the sheet too, since the sheet's schedule replaced that lens. Bare #range is
// left alone: it still names the Range section.
const OLD_LENSES = new Set(['#lens-plan', '#lens-terrain', '#lens-console', '#lens-index', '#lens-range', '#plan', '#terrain', '#console', '#index'])
const AREA_HASH = /^#area-(.+)$/

function requireIn<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`sheet: ${selector} is missing`)
  return found
}

// A modified or non-primary click asks for the link itself (a new tab or window), so it is let through.
const followsLink = (event: MouseEvent) => event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey

function bindSummits(sheet: HTMLElement, data: IslandData): void {
  sheet.addEventListener('click', (event) => {
    const summit = event.target instanceof Element ? event.target.closest<HTMLElement>('a.summit[data-summit]') : null
    if (!summit || followsLink(event)) return
    const domainId = summit.dataset.summit
    if (!data.domains.some((domain) => domain.id === domainId)) throw new Error(`sheet: summit names unknown area ${domainId}`)
    event.preventDefault()
    showArea(domainId as DomainId, { focus: true })
  })
}

// Each materials row becomes a button that takes the row's class and children, so nothing moves.
// The row for the material shown is marked current, as the summit for an area is.
function bindMaterials(sheet: HTMLElement): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = []
  for (const item of sheet.querySelectorAll<HTMLElement>('.materials li[data-material]')) {
    const row = item.querySelector('.mat-row')
    const materialId = item.dataset.material
    if (!row || !materialId) throw new Error('sheet: a materials row is missing its material')
    const button = el('button', { type: 'button', class: 'mat-row', 'data-material-open': materialId, 'aria-controls': 'readout' }, [
      ...row.childNodes,
    ])
    row.replaceWith(button)
    buttons.push(button)
  }
  sheet.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-material-open]') : null
    if (button?.dataset.materialOpen) showMaterial(button.dataset.materialOpen)
  })
  return buttons
}

function markShown(sheet: HTMLElement, materialButtons: HTMLButtonElement[], shown: Shown | null): void {
  const domainId = shown && 'domainId' in shown ? shown.domainId : null
  const materialId = shown && 'materialId' in shown ? shown.materialId : null
  for (const summit of sheet.querySelectorAll<HTMLElement>('a.summit[data-summit]')) {
    if (summit.dataset.summit === domainId) summit.setAttribute('aria-current', 'true')
    else summit.removeAttribute('aria-current')
  }
  for (const button of materialButtons) {
    if (button.dataset.materialOpen === materialId) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  }
}

// Types the command after the prompt a character at a time; reduced motion writes it at once.
function typeCommand(target: HTMLElement): (shown: Shown | null) => void {
  let timer = 0
  return (shown) => {
    window.clearInterval(timer)
    const full = shown ? `${COMMAND} ${'domainId' in shown ? shown.domainId : shown.materialId}` : COMMAND
    if (!shown || prefersReducedMotion()) {
      target.textContent = full
      return
    }
    let length = COMMAND.length + 1
    target.textContent = full.slice(0, length)
    timer = window.setInterval(() => {
      target.textContent = full.slice(0, ++length)
      if (length >= full.length) window.clearInterval(timer)
    }, TYPE_MS)
  }
}

// Hovering or focusing a methods row lights its trail in both drawings, and its tag.
function bindMethods(sheet: HTMLElement): void {
  const light = (methodId: string | null) => {
    for (const item of sheet.querySelectorAll<Element>('tr[data-method], path.trail[data-method], .tag[data-method]')) {
      item.classList.toggle('on', item.getAttribute('data-method') === methodId)
    }
  }
  const focusedMethod = () => (document.activeElement instanceof HTMLElement && document.activeElement.matches('#sheet tr[data-method]') ? (document.activeElement.dataset.method ?? null) : null)
  for (const row of sheet.querySelectorAll<HTMLElement>('tr[data-method]')) {
    row.tabIndex = 0
    row.addEventListener('mouseenter', () => light(row.dataset.method ?? null))
    row.addEventListener('mouseleave', () => light(focusedMethod()))
    row.addEventListener('focus', () => light(row.dataset.method ?? null))
    row.addEventListener('blur', () => light(null))
  }
}

// Old lens links scroll to the sheet and drop the hash, keeping any query string; #area-<id> shows
// that area in the readout.
function landOnHash(sheet: HTMLElement, data: IslandData): void {
  const hash = window.location.hash
  if (OLD_LENSES.has(hash)) {
    sheet.scrollIntoView({ block: 'start' })
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    return
  }
  const domainId = AREA_HASH.exec(hash)?.[1]
  if (!domainId || !data.domains.some((domain) => domain.id === domainId)) return
  showArea(domainId as DomainId)
  requireIn<HTMLElement>(sheet, '#readout').scrollIntoView({ block: 'nearest' })
}

export function initSheet(data: IslandData): void {
  const sheet = document.getElementById('sheet')
  if (!sheet) throw new Error('initSheet: #sheet is missing')
  initReadout(data)
  const materialButtons = bindMaterials(sheet)
  bindSummits(sheet, data)
  bindMethods(sheet)
  const cmd = requireIn<HTMLElement>(sheet, '#sheet-cmd')
  cmd.addEventListener('click', openPalette)
  const type = typeCommand(requireIn<HTMLElement>(cmd, '[data-cmd-text]'))
  onReadoutChange((shown) => {
    markShown(sheet, materialButtons, shown)
    type(shown)
  })
  landOnHash(sheet, data)
  window.addEventListener('hashchange', () => landOnHash(sheet, data))
}
