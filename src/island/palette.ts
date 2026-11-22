// The command palette: Ctrl or Cmd + K, or the Search button in the bar.
// Plain text filters every entry; "kind: term" scopes to one kind; "mode: <mode>" lists the
// proofs worked in that mode; "kp <domain|method|material>" runs a command, and "kp open <term>" runs
// the same one. A material's command matches its id or its name.
import type { DomainId } from '../model/schema'
import type { IslandData } from './data'
import { el } from './dom'
import { proofCount } from './format'
import { popModal, pushModal } from './modal'
import { prefersReducedMotion } from './motion'
import { showArea, showMaterial } from './readout'
import { THEMES, setTheme } from './state'

type Kind = 'domain' | 'proof' | 'method' | 'material' | 'mode' | 'theme' | 'command'

interface Entry {
  kind: Kind
  label: string
  hint: string
  search: string
  run(): void
  proofId?: string
  keepOpen?: boolean
}

const KIND_LABELS: Record<Kind, string> = {
  domain: 'Domain',
  proof: 'Proof',
  method: 'Method',
  material: 'Material',
  mode: 'Mode',
  theme: 'Theme',
  command: 'Command',
}
const SCOPED = /^([a-z]+):\s*(.*)$/
const OPEN_ALIAS = /^kp open(?=\s|$)/

let palette: HTMLElement
let input: HTMLInputElement
let list: HTMLElement
let entries: Entry[] = []
let shown: Entry[] = []
let active = 0
let opener: HTMLElement | null = null
let data: IslandData

export const isPaletteOpen = () => !palette.hidden

// Each method has its own anchor in How I work; the palette scrolls to it and moves focus there.
function scrollToMethod(id: string): void {
  const target = document.getElementById(`method-${id.toLowerCase()}`)
  if (!target) throw new Error(`palette: How I work has no anchor for method ${id}`)
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

export interface Command {
  label: string
  hint: string
  run(): void
}

// The `kp <id>` commands: one per area, method and material, each opening what it names. The three
// share one space of labels, which a unit test keeps free of collisions.
export function commandList(islandData: IslandData): Command[] {
  return [
    ...islandData.domains.map((domain) => ({ label: `kp ${domain.id}`, hint: domain.name, run: () => showArea(domain.id, { focus: true }) })),
    ...islandData.methods.map((method) => ({ label: `kp ${method.id.toLowerCase()}`, hint: method.name, run: () => scrollToMethod(method.id) })),
    ...islandData.materials.map((material) => ({ label: `kp ${material.id}`, hint: material.name, run: () => showMaterial(material.id) })),
  ]
}

function buildEntries(): Entry[] {
  const domainName = (id: DomainId) => data.domains.find((domain) => domain.id === id)?.name ?? id
  const make = (kind: Kind, label: string, hint: string, run: () => void, extra = ''): Entry => ({
    kind,
    label,
    hint,
    run,
    search: `${label} ${hint} ${extra}`.toLowerCase(),
  })
  const domains = data.domains.map((domain) =>
    make('domain', domain.name, proofCount(data.proofs.filter((proof) => proof.domainId === domain.id).length), () =>
      showArea(domain.id, { focus: true }),
    ),
  )
  const proofs = data.proofs.map((proof) => ({
    ...make('proof', proof.label, domainName(proof.domainId), () => showArea(proof.domainId, { focus: true }), proof.detail),
    proofId: proof.id,
  }))
  const methods = data.methods.map((method) => make('method', `${method.id} ${method.name}`, 'How I work', () => scrollToMethod(method.id)))
  const materials = data.materials.map((material) =>
    make('material', material.name, material.band, () => showMaterial(material.id)),
  )
  const modes = data.modes.map((mode) => ({
    ...make('mode', `mode: ${mode.id}`, proofCount(data.proofs.filter((proof) => proof.modes.includes(mode.id)).length), () =>
      showQuery(`mode: ${mode.id}`),
    ),
    keepOpen: true,
  }))
  const themes = THEMES.map((theme) => make('theme', `theme: ${theme}`, '', () => setTheme(theme)))
  const commands = commandList(data).map((command) => make('command', command.label, command.hint, command.run))
  return [...domains, ...proofs, ...methods, ...materials, ...modes, ...themes, ...commands]
}

function proofsInMode(term: string): Entry[] {
  const modes = data.modes.filter((mode) => mode.id.startsWith(term) || mode.name.toLowerCase().startsWith(term))
  if (term === '' || modes.length === 0) return entries.filter((entry) => entry.kind === 'mode' && entry.search.includes(term))
  const modeIds = new Set(modes.map((mode) => mode.id))
  const proofIds = new Set(data.proofs.filter((proof) => proof.modes.some((mode) => modeIds.has(mode))).map((proof) => proof.id))
  return entries.filter((entry) => entry.proofId !== undefined && proofIds.has(entry.proofId))
}

function matching(query: string): Entry[] {
  // The command line and the readout print `kp open <id>` for an area or a material, so that runs as `kp <id>`.
  const q = query.trim().toLowerCase().replace(OPEN_ALIAS, 'kp')
  const scoped = SCOPED.exec(q)
  if (scoped?.[1] === 'mode') return proofsInMode(scoped[2])
  if (scoped && scoped[1] in KIND_LABELS) {
    const kind = scoped[1] as Kind
    return entries.filter((entry) => entry.kind === kind && entry.search.includes(scoped[2]))
  }
  if (q === 'kp' || q.startsWith('kp ')) {
    const term = q.slice(2).trim()
    const found = entries.filter((entry) => entry.kind === 'command' && entry.search.includes(term))
    // An exact command wins the top slot, so "kp a" runs method A and not a partial match.
    return found.sort((a, b) => Number(b.label === q) - Number(a.label === q))
  }
  return entries.filter((entry) => entry.kind !== 'command' && (q === '' || entry.search.includes(q)))
}

function render(): void {
  shown = matching(input.value)
  active = Math.min(active, Math.max(0, shown.length - 1))
  const items = shown.map((entry, position) =>
    el('li', { role: 'option', id: `pal-opt-${position}`, 'data-kind': entry.kind, 'data-index': String(position), 'aria-selected': String(position === active) }, [
      el('span', { class: 'k' }, [KIND_LABELS[entry.kind]]),
      el('span', { class: 'label' }, [entry.label]),
      el('span', { class: 'h' }, [entry.hint]),
    ]),
  )
  list.replaceChildren(...(items.length > 0 ? items : [el('li', { class: 'empty', role: 'presentation' }, ['No match. Try a domain, a proof, a method or "mode: teach".'])]))
  if (shown.length > 0) input.setAttribute('aria-activedescendant', `pal-opt-${active}`)
  else input.removeAttribute('aria-activedescendant')
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function showQuery(query: string): void {
  input.value = query
  active = 0
  render()
  input.focus()
}

export function openPalette(): void {
  if (isPaletteOpen()) return
  const focused = document.activeElement
  opener = focused instanceof HTMLElement && focused !== document.body ? focused : null
  palette.hidden = false
  pushModal(palette)
  // Built afresh on each open, from the island data and the theme list.
  entries = buildEntries()
  showQuery('')
}

export function closePalette(): void {
  if (!isPaletteOpen()) return
  // Blur first: with no opener to return to, the hidden input must not keep focus and go on taking
  // the keys typed on the page.
  input.blur()
  palette.hidden = true
  popModal(palette)
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
}

function runEntry(position: number): void {
  const entry = shown[position]
  if (!entry) return
  if (!entry.keepOpen) closePalette()
  entry.run()
}

function onInputKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const offset = event.key === 'ArrowDown' ? 1 : -1
    active = Math.min(Math.max(active + offset, 0), Math.max(0, shown.length - 1))
    render()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    runEntry(active)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
  } else if (event.key === 'Tab') {
    // The input is the palette's only stop: arrows move through results.
    event.preventDefault()
  }
}

function platformHint(): string {
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = agent.userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad/i.test(platform) ? 'Cmd K' : 'Ctrl K'
}

export function initPalette(islandData: IslandData): void {
  data = islandData
  const root = document.getElementById('palette')
  const field = root?.querySelector('input')
  const results = root?.querySelector<HTMLElement>('[role="listbox"]')
  if (!root || !field || !results) throw new Error('initPalette: #palette, its input or its listbox is missing')
  palette = root
  input = field
  list = results
  const button = document.getElementById('palette-open')
  const hint = button?.querySelector('.hint')
  if (hint) hint.textContent = platformHint()
  button?.addEventListener('click', openPalette)

  input.addEventListener('input', () => {
    active = 0
    render()
  })
  input.addEventListener('keydown', onInputKey)
  list.addEventListener('click', (event) => {
    const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null
    if (option) runEntry(Number(option.dataset.index))
  })
  palette.addEventListener('click', (event) => {
    if (event.target === palette) closePalette()
  })
  // A press on the box outside the input (its padding, its footer, a "No match" row) keeps focus in
  // the input, so Esc, the arrows and Tab keep working; option clicks still run.
  palette.querySelector('.pal-box')?.addEventListener('mousedown', (event) => {
    if (event.target !== input) event.preventDefault()
  })
  palette.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      closePalette()
    }
  })
  document.addEventListener('keydown', (event) => {
    // Ctrl or Cmd plus K, read from the physical key too so non-Latin layouts work; Shift is left alone.
    const k = event.code === 'KeyK' || event.key.toLowerCase() === 'k'
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && k) {
      event.preventDefault()
      if (isPaletteOpen()) closePalette()
      else openPalette()
    }
  })
}
