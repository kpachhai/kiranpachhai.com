// The slice of the content model the island needs, serialised once into the page by Stage.astro.
// Only types cross from src/model, so zod and the full model never reach the browser bundle.
import { STATUS_LABELS } from '../model/labels'
import type { DomainId, MethodId, Model, ModeId, Role } from '../model/schema'

export interface IslandUpstream {
  label: string
  href: string
  status: string
  statusLabel: string
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
}

export interface IslandData {
  domains: IslandDomain[]
  proofs: IslandProof[]
  methods: { id: MethodId; name: string }[]
  materials: { id: string; name: string; band: string; usedIn: string[] }[]
  modes: { id: ModeId; name: string }[]
  range: { domainId: DomainId; mode: ModeId; proofIds: string[] }[]
  // Titles only: the hero's role cycle needs nothing else, and titles carry no employer.
  roles: Pick<Role, 'title'>[]
}

export const DATA_ELEMENT_ID = 'island-data'

export function buildIslandData(model: Model): IslandData {
  return {
    domains: model.domains.map(({ id, name, upstream }) => ({
      id,
      name,
      upstream: upstream.map(({ label, href, status }) => ({ label, href, status, statusLabel: STATUS_LABELS[status] })),
    })),
    proofs: model.proofs.map(({ id, label, detail, href, domainId, methods }) => ({
      id,
      label,
      detail,
      href,
      domainId,
      methods,
      modes: model.range.filter((cell) => cell.proofIds.includes(id)).map((cell) => cell.mode),
    })),
    methods: model.methods.map(({ id, name }) => ({ id, name })),
    materials: model.materials.map(({ id, name, band, usedIn }) => ({ id, name, band, usedIn })),
    modes: model.modes.map(({ id, name }) => ({ id, name })),
    range: model.range.map(({ domainId, mode, proofIds }) => ({ domainId, mode, proofIds })),
    roles: model.roles.map(({ title }) => ({ title })),
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
