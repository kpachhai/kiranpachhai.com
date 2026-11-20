import { caseStudies } from './data/caseStudies'
import { domains, proofs } from './data/domains'
import { materials } from './data/materials'
import { methods } from './data/methods'
import { modes, range } from './data/modes'
import { roles } from './data/roles'
import { talks } from './data/talks'
import { timeline } from './data/timeline'
import { ModelSchema, type Model } from './schema'

const hero = {
  name: 'Kiran Pachhai',
  roleLine:
    'Developer Advocate and solutions architect. Protocol work on Hedera and EVM, AI agent harnesses, and explainers.',
  thesis: 'Systems I build, the methods I build them with, and the proof for each.',
}

function assertReferences(candidate: Model): void {
  const known = new Set(candidate.proofs.map((proof) => proof.id))
  const references: [string, string][] = [
    ...candidate.materials.flatMap((material) => material.usedIn.map((id): [string, string] => [`material ${material.id}`, id])),
    ...candidate.range.flatMap((cell) => cell.proofIds.map((id): [string, string] => [`range ${cell.domainId}/${cell.mode}`, id])),
    ...candidate.roles.flatMap((role) => role.proofIds.map((id): [string, string] => [`role ${role.title}`, id])),
    ...candidate.caseStudies.flatMap((study) => study.proofIds.map((id): [string, string] => [`case study ${study.slug}`, id])),
  ]
  const dangling = references.filter(([, id]) => !known.has(id))
  if (dangling.length > 0) {
    throw new Error(`content model references unknown proofs: ${dangling.map(([owner, id]) => `${owner} -> ${id}`).join(', ')}`)
  }
}

export const model: Model = ModelSchema.parse({
  hero,
  domains,
  proofs,
  methods,
  materials,
  modes,
  range,
  roles,
  timeline,
  talks,
  caseStudies,
})

assertReferences(model)

export type * from './schema'
