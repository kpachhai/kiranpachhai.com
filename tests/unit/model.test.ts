import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadGithubData } from '../../scripts/data/fetch-github'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'
import { model } from '../../src/model/index'
import { DOMAIN_IDS, ProofSchema } from '../../src/model/schema'

const SNAPSHOT = fileURLToPath(new URL('../../src/data/github.snapshot.json', import.meta.url))
const LIVE = fileURLToPath(new URL('../../src/data/github.json', import.meta.url))

const proofIds = new Set(model.proofs.map((proof) => proof.id))

describe('content model', () => {
  it('has the six domains in order', () => {
    expect(model.domains.length).toBe(6)
    expect(model.domains.map((domain) => domain.id)).toEqual([...DOMAIN_IDS])
  })

  it('names the five methods exactly', () => {
    expect(model.methods.map((method) => method.name)).toEqual([
      'Spec first',
      'Staged gates',
      'Provenance',
      'Plugin standards',
      'Explain it visually',
    ])
  })

  it('lists exactly four languages and no Rust', () => {
    const languages = model.materials.filter((material) => material.band === 'language')
    expect(languages.map((material) => material.name)).toEqual(['Solidity', 'TypeScript', 'Go', 'Python'])
    expect(model.materials.some((material) => material.name === 'Rust')).toBe(false)
  })

  it('gives every proof a source and an https href when it has one', () => {
    for (const proof of model.proofs) {
      expect(proof.source, proof.id).toBeDefined()
      if (proof.href !== undefined) expect(proof.href.startsWith('https://'), proof.id).toBe(true)
    }
  })

  it('has unique proof ids', () => {
    expect(proofIds.size).toBe(model.proofs.length)
  })

  it('only references proof ids that exist', () => {
    const referenced = [
      ...model.materials.flatMap((material) => material.usedIn),
      ...model.range.flatMap((cell) => cell.proofIds),
      ...model.roles.flatMap((role) => role.proofIds),
      ...model.caseStudies.flatMap((caseStudy) => caseStudy.proofIds),
    ]
    for (const id of referenced) expect(proofIds.has(id), id).toBe(true)
  })

  it('keeps every range cell inside its domain and never empty', () => {
    const byId = new Map(model.proofs.map((proof) => [proof.id, proof]))
    for (const cell of model.range) {
      expect(cell.proofIds.length, `${cell.domainId}/${cell.mode}`).toBeGreaterThan(0)
      for (const id of cell.proofIds) expect(byId.get(id)?.domainId, `${cell.domainId}/${cell.mode}/${id}`).toBe(cell.domainId)
    }
  })

  it('has at most one range cell per domain and mode', () => {
    const keys = model.range.map((cell) => `${cell.domainId}/${cell.mode}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every material a use', () => {
    for (const material of model.materials) expect(material.usedIn.length, material.name).toBeGreaterThan(0)
  })

  it('rejects a proof without a source', () => {
    const proof = model.proofs[0]!
    const { source: _omitted, ...withoutSource } = proof
    expect(() => ProofSchema.parse(withoutSource)).toThrow()
  })

  it('keeps private proofs unlinked', () => {
    for (const proof of model.proofs.filter((item) => item.private)) {
      expect(proof.href, proof.id).toBeUndefined()
    }
  })

  it('gives the Plumbing of Money proof no href', () => {
    const plumbing = model.proofs.find((proof) => proof.label === 'The Plumbing of Money')
    expect(plumbing).toBeDefined()
    expect(plumbing!.href).toBeUndefined()
  })

  it('contains no em dash', () => {
    expect(JSON.stringify(model)).not.toContain('\u2014')
  })
})

// Owner ruling: no HIP proposal or HIP review appears on the site. The schedule-service
// items may name the feature they demonstrate in their detail text only.
const HIP_NUMBER = /HIP-?\d{3,4}/i
// Matches the HIP repository and any fork of it.
const HIP_REPO = 'improvement-proposals'
const DETAIL_EXEMPT = new Set(['schedule-service-demos', 'schedule-service-tutorials'])

function stringsOf(value: unknown, path: string, out: { path: string; key: string; text: string }[], owner?: string) {
  if (typeof value === 'string') {
    out.push({ path, key: path.split('.').pop() ?? '', text: value })
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => stringsOf(item, `${path}[${index}]`, out, owner))
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : owner
    for (const [key, child] of Object.entries(record)) {
      const exempt = key === 'detail' && id !== undefined && DETAIL_EXEMPT.has(id)
      if (!exempt) stringsOf(child, `${path}.${key}`, out, id)
    }
  }
  return out
}

describe('site has no HIP proposal or review content', () => {
  const ledgers = [
    loadGithubData({ livePath: '/nonexistent', snapshotPath: SNAPSHOT }).ledger,
    ...(existsSync(LIVE) ? [loadGithubData({ livePath: LIVE }).ledger] : []),
  ]

  it('names no HIP number outside href, url and the schedule-service detail text', () => {
    const offending = stringsOf(model, 'model', []).filter(
      (entry) => entry.key !== 'href' && entry.key !== 'url' && HIP_NUMBER.test(entry.text),
    )
    expect(offending).toEqual([])
  })

  it('has no ledger label with a HIP number', () => {
    for (const ledger of ledgers) {
      expect(ledger.filter((entry) => HIP_NUMBER.test(entry.label)).map((entry) => entry.label)).toEqual([])
    }
  })

  it('points no href, source or ledger entry at the HIP repository', () => {
    const hrefs = stringsOf(model, 'model', []).filter((entry) => entry.key === 'href' || entry.key === 'url')
    expect(hrefs.filter((entry) => entry.text.includes(HIP_REPO)).map((entry) => entry.path)).toEqual([])
    for (const ledger of ledgers) {
      expect(ledger.filter((entry) => entry.href.includes(HIP_REPO)).map((entry) => entry.label)).toEqual([])
    }
    expect(Object.keys(UPSTREAM_MAP).filter((repo) => repo.includes(HIP_REPO))).toEqual([])
  })
})
