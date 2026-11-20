import { join } from 'node:path'
import { loadGithubData } from '../../scripts/data/fetch-github'
import { model, type DomainId, type MethodId, type Proof } from '../model'

// Paths resolve from the project root because the build bundles this module elsewhere.
const dataDir = join(process.cwd(), 'src', 'data')
export const github = loadGithubData({
  livePath: join(dataDir, 'github.json'),
  snapshotPath: join(dataDir, 'github.snapshot.json'),
})

const proofs = new Map(model.proofs.map((proof) => [proof.id, proof]))
const domainNames = new Map(model.domains.map((domain) => [domain.id, domain.name]))
const methodNames = new Map(model.methods.map((method) => [method.id, method.name]))

export function proofById(id: string): Proof {
  const proof = proofs.get(id)
  if (!proof) throw new Error(`unknown proof id: ${id}`)
  return proof
}

export const domainName = (id: DomainId): string => domainNames.get(id) ?? id
export const methodName = (id: MethodId): string => methodNames.get(id) ?? id
export const proofsInDomain = (id: DomainId): Proof[] => model.proofs.filter((proof) => proof.domainId === id)
export const languages = model.materials.filter((material) => material.band === 'language').map((material) => material.name)

export const SITE_DESCRIPTION = model.hero.roleLine
export const OG_DEFAULT = '/og/default.png'

export const PERSON = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: model.hero.name,
  url: 'https://kiranpachhai.com/',
  sameAs: ['https://github.com/kpachhai', 'https://www.linkedin.com/in/kiranpachhai'],
}
