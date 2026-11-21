// The slice of the content model the island needs, serialised once into the page by Stage.astro.
// Only types cross from src/model, so zod and the full model never reach the browser bundle.
import { STATUS_LABELS } from '../model/labels'
import type { DomainId, MethodId, Model, ModeId, Source } from '../model/schema'
import type { SourceLabel } from '../lib/provenance'
import type { UpstreamRow } from '../lib/upstream'

export interface IslandUpstream {
  label: string
  href: string
  statuses: { status: string; label: string }[]
  links: { href: string; note: string }[]
}

export interface IslandDomain {
  id: DomainId
  name: string
  upstream: IslandUpstream[]
}

export interface IslandProof {
  id: string
  label: string
  detail: string
  href?: string
  domainId: DomainId
  methods: MethodId[]
  modes: ModeId[]
  source: SourceLabel
}

export interface IslandData {
  domains: IslandDomain[]
  proofs: IslandProof[]
  methods: { id: MethodId; name: string }[]
  materials: { id: string; name: string; band: string; usedIn: string[]; source: SourceLabel }[]
  modes: { id: ModeId; name: string }[]
  range: { domainId: DomainId; mode: ModeId; proofIds: string[] }[]
  // Short titles only: the hero's role cycle needs nothing else, and titles carry no employer.
  roles: { title: string }[]
}

export const DATA_ELEMENT_ID = 'island-data'

// labelOf turns a model source into its visible label at build time (src/lib/provenance.ts); it is
// passed in so the label code, which reads the copy rules, never enters the browser bundle.
// upstream is the site's one upstream list (src/lib/site.ts), so the readout shows the ledger's rows.
export function buildIslandData(model: Model, labelOf: (source: Source) => SourceLabel, upstream: UpstreamRow[]): IslandData {
  return {
    domains: model.domains.map(({ id, name }) => ({
      id,
      name,
      upstream: upstream
        .filter((row) => row.domainId === id)
        .map(({ label, href, statuses, links }) => ({
          label,
          href,
          statuses: statuses.map((status) => ({ status, label: STATUS_LABELS[status] })),
          links: links.map(({ href: linkHref, note }) => ({ href: linkHref, note })),
        })),
    })),
    proofs: model.proofs.map(({ id, label, detail, href, domainId, methods, source }) => ({
      id,
      label,
      detail,
      href,
      domainId,
      methods,
      modes: model.range.filter((cell) => cell.proofIds.includes(id)).map((cell) => cell.mode),
      source: labelOf(source),
    })),
    methods: model.methods.map(({ id, name }) => ({ id, name })),
    materials: model.materials.map(({ id, name, band, usedIn, source }) => ({ id, name, band, usedIn, source: labelOf(source) })),
    modes: model.modes.map(({ id, name }) => ({ id, name })),
    range: model.range.map(({ domainId, mode, proofIds }) => ({ domainId, mode, proofIds })),
    roles: model.roles.flatMap(({ cycleTitle }) => (cycleTitle ? [{ title: cycleTitle }] : [])),
  }
}

// Escapes "<" so a label can never close the surrounding script element.
export function serialiseIslandData(data: IslandData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function readIslandData(): IslandData {
  const element = document.getElementById(DATA_ELEMENT_ID)
  if (!element?.textContent) throw new Error(`island: #${DATA_ELEMENT_ID} is missing`)
  return JSON.parse(element.textContent) as IslandData
}
