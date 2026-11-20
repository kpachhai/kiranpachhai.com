import { caseStudies } from './data/caseStudies'
import { domains, proofs } from './data/domains'
import { materials } from './data/materials'
import { methods } from './data/methods'
import { modes, range } from './data/modes'
import { hats, roles } from './data/roles'
import { skills } from './data/skills'
import { OWNER } from './data/sources'
import { talks } from './data/talks'
import { timeline } from './data/timeline'
import { ModelSchema, type Model } from './schema'

const hero = {
  name: 'Kiran Pachhai',
  roleLine:
    'Developer Advocate and solutions architect. Protocol work on Hedera and EVM, AI agent harnesses, and explainers.',
  thesis: 'Systems I build, the methods I build them with, and the proof for each.',
  source: OWNER,
}

// Fails the build on a dangling id, a duplicate id, or a range cell that cites a proof from
// another area. Upstream rows are derived per area from one table (src/lib/upstream.ts).
export function assertReferences(candidate: Model): void {
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
  assertConsistency(candidate)
  assertCareerReferences(candidate)
}

function duplicates(ids: string[]): string[] {
  return ids.filter((id, position) => ids.indexOf(id) !== position)
}

function assertConsistency(candidate: Model): void {
  const domainOf = new Map(candidate.proofs.map((proof) => [proof.id, proof.domainId]))
  const problems = [
    ...duplicates(candidate.proofs.map((proof) => proof.id)).map((id) => `duplicate proof id ${id}`),
    ...duplicates(candidate.materials.map((material) => material.id)).map((id) => `duplicate material id ${id}`),
    ...duplicates(candidate.talks.map((talk) => talk.id)).map((id) => `duplicate talk id ${id}`),
    ...candidate.range.flatMap((cell) =>
      cell.proofIds
        .filter((id) => domainOf.has(id) && domainOf.get(id) !== cell.domainId)
        .map((id) => `range ${cell.domainId}/${cell.mode} cites ${id} from ${domainOf.get(id)}`),
    ),
  ]
  if (problems.length > 0) throw new Error(`content model is inconsistent: ${problems.join(', ')}`)
}

// Skills and roles point at each other; a typo in either id fails the build here.
function assertCareerReferences(candidate: Model): void {
  const proofIds = new Set(candidate.proofs.map((proof) => proof.id))
  const skillIds = new Set(candidate.skills.map((skill) => skill.id))
  const roleIds = new Set(candidate.roles.map((role) => role.id))
  const dangling = [
    ...candidate.roles.flatMap((role) => role.skillsAdded.filter((id) => !skillIds.has(id)).map((id) => `role ${role.id} -> skill ${id}`)),
    ...candidate.skills.flatMap((skill) => [
      ...(skill.evidence.roleIds ?? []).filter((id) => !roleIds.has(id)).map((id) => `skill ${skill.id} -> role ${id}`),
      ...(skill.evidence.proofIds ?? []).filter((id) => !proofIds.has(id)).map((id) => `skill ${skill.id} -> proof ${id}`),
    ]),
  ]
  if (dangling.length > 0) throw new Error(`content model references unknown ids: ${dangling.join(', ')}`)
}

export const model: Model = ModelSchema.parse({
  hero,
  domains,
  proofs,
  methods,
  materials,
  modes,
  range,
  skills,
  hats,
  roles,
  timeline,
  talks,
  caseStudies,
})

assertReferences(model)

// The short titles the hero's role line cycles through, in journey order.
export const cycleTitles: string[] = model.roles.flatMap((role) => (role.cycleTitle ? [role.cycleTitle] : []))

export type * from './schema'
