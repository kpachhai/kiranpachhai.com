import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadGithubData } from '../../scripts/data/fetch-github'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'
import { assertReferences, model } from '../../src/model/index'
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

  // Owner ruling 2026-11-20: Operate is no longer a Range mode. The Operator/SRE hat is a role hat
  // in the Journey and stays.
  it('has the four Range modes and no Operate cell', () => {
    expect(model.modes.map((mode) => mode.name)).toEqual(['Build', 'Architect', 'Research', 'Teach'])
    expect(model.range.filter((cell) => (cell.mode as string) === 'operate')).toEqual([])
    expect(JSON.stringify(model.modes) + JSON.stringify(model.range)).not.toMatch(/operate/i)
    expect(model.hats.map((hat) => hat.id)).toContain('operator')
  })

  // Owner ruling 2026-11-20: LinkedIn-sourced items carry no link; their source still says LinkedIn.
  it('links no proof or talk to LinkedIn', () => {
    for (const item of [...model.proofs, ...model.talks]) {
      expect(item.href ?? '', item.id).not.toMatch(/linkedin\.com/i)
    }
    // The items that used to link the profile now have no link at all.
    for (const id of ['hedera-wallet-snap', 'l1-vm', 'storage-node', 'rsyslog-exporter']) {
      expect(model.proofs.find((proof) => proof.id === id)!.href, id).toBeUndefined()
    }
    for (const id of ['onchain-automation-workshop', 'cross-ledger-session']) {
      expect(model.talks.find((talk) => talk.id === id)!.href, id).toBeUndefined()
    }
  })

  // Owner ruling 2026-11-20: The Plumbing of Money shows Staged gates and Explain it visually only.
  it('gives The Plumbing of Money methods B and E', () => {
    expect(model.proofs.find((proof) => proof.id === 'plumbing-of-money')!.methods).toEqual(['B', 'E'])
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

  it('rejects a private proof that gains an href', () => {
    const hidden = model.proofs.find((proof) => proof.private)!
    expect(() => ProofSchema.parse({ ...hidden, href: 'https://example.com/' })).toThrow()
  })

  it('fails on a duplicate id or a range cell citing another area', () => {
    expect(() => assertReferences(model)).not.toThrow()
    expect(() => assertReferences({ ...model, materials: [...model.materials, model.materials[0]!] })).toThrow(/duplicate material id/)
    expect(() => assertReferences({ ...model, talks: [...model.talks, model.talks[0]!] })).toThrow(/duplicate talk id/)
    const cell = model.range[0]!
    const elsewhere = model.proofs.find((proof) => proof.domainId !== cell.domainId)!
    expect(() => assertReferences({ ...model, range: [{ ...cell, proofIds: [elsewhere.id] }, ...model.range.slice(1)] })).toThrow(/cites/)
  })

  it('links each pinned discussions item to a discussions page', () => {
    const links = Object.values(UPSTREAM_MAP).flatMap((entry) => entry.links ?? [])
    const discussions = links.filter((link) => /discussion/i.test(link.note))
    expect(discussions.length).toBeGreaterThan(0)
    for (const link of discussions) expect(link.href, link.note).toMatch(/\/discussions(\/|$)/)
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
const HIP_NUMBER = /\bHIP[-\s]?\d{1,4}\b/i
// HIP work named without a number.
const HIP_PHRASE = /co[-\s]?authored\s+HIPs?\b|\bHIPs?\s+(?:proposals?|reviews?|authors?|authorship)\b/i
// Matches the HIP repository and any fork of it, and the HIP site.
const HIP_TARGETS = ['improvement-proposals', 'hips.hedera.com']
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

describe('talk rows', () => {
  // The docs tutorials row links PR 375 (the fork testing parts); schedule service has its own proof.
  it('claim only what their source shows', () => {
    const tutorials = model.talks.find((talk) => talk.id === 'hedera-docs-tutorials')!
    expect(tutorials.source).toEqual({ kind: 'url', url: 'https://github.com/hashgraph/hedera-docs/pull/375' })
    expect(tutorials.detail).toMatch(/fork testing/i)
    expect(tutorials.detail).not.toMatch(/schedule/i)
  })
})

describe('case-study wording', () => {
  // The manifest describes "a deep insight into Hedera transactions" through MetaMask's
  // transaction-insight permission, which runs at confirmation; the blurb restates no more than that.
  it('SignScope says plainly what its manifest claims', () => {
    const signscope = model.caseStudies.find((study) => study.slug === 'signscope-snap')!
    expect(signscope.problem.source).toEqual({ kind: 'url', url: 'https://github.com/kpachhai/signscope-snap/blob/main/packages/snap/snap.manifest.json' })
    expect(signscope.problem.text).toBe('In MetaMask, SignScope shows what a Hedera transaction contains before it is signed.')
  })
})

describe('proof details', () => {
  it('count the schedule service tutorials once, under their own proof', () => {
    const mentions = model.proofs.filter((proof) => /schedule service tutorials/i.test(`${proof.label} ${proof.detail}`)).map((proof) => proof.id)
    expect(mentions).toEqual(['schedule-service-tutorials'])
  })
})

describe('site has no HIP proposal or review content', () => {
  const ledgers = [
    loadGithubData({ livePath: '/nonexistent', snapshotPath: SNAPSHOT }).ledger,
    ...(existsSync(LIVE) ? [loadGithubData({ livePath: LIVE }).ledger] : []),
  ]

  it('names no HIP number outside href, url and the schedule-service detail text', () => {
    const offending = [...stringsOf(model, 'model', []), ...stringsOf(UPSTREAM_MAP, 'upstream', [])].filter(
      (entry) => entry.key !== 'href' && entry.key !== 'url' && HIP_NUMBER.test(entry.text),
    )
    expect(offending).toEqual([])
  })

  it('names no HIP authorship or review, with or without a number', () => {
    const offending = [...stringsOf(model, 'model', []), ...stringsOf(UPSTREAM_MAP, 'upstream', [])].filter(
      (entry) => entry.key !== 'href' && entry.key !== 'url' && HIP_PHRASE.test(entry.text),
    )
    expect(offending).toEqual([])
  })

  it('catches the spaced, number-free and HIP-site forms', () => {
    expect(HIP_NUMBER.test('HIP 9876')).toBe(true)
    expect(HIP_NUMBER.test('hip-987')).toBe(true)
    expect(HIP_NUMBER.test('HIP-18')).toBe(true)
    expect(HIP_NUMBER.test('HIP 9')).toBe(true)
    expect(HIP_PHRASE.test('co authored HIPs')).toBe(true)
    expect(HIP_PHRASE.test('co-authored HIPs')).toBe(true)
    expect(HIP_PHRASE.test('Coauthored HIP')).toBe(true)
    expect(HIP_PHRASE.test('HIP proposal reviews')).toBe(true)
    expect(HIP_PHRASE.test('HIP reviews')).toBe(true)
    expect(HIP_PHRASE.test('an agent that indexes HIPs')).toBe(false)
    expect(HIP_TARGETS.some((target) => 'https://hips.hedera.com/hip/hip-9876'.includes(target))).toBe(true)
  })

  it('has no ledger label with a HIP number', () => {
    for (const ledger of ledgers) {
      expect(ledger.filter((entry) => HIP_NUMBER.test(entry.label)).map((entry) => entry.label)).toEqual([])
    }
  })

  it('points no href, source or ledger entry at the HIP repository', () => {
    const hipTarget = (text: string) => HIP_TARGETS.some((target) => text.includes(target))
    const hrefs = [...stringsOf(model, 'model', []), ...stringsOf(UPSTREAM_MAP, 'upstream', [])].filter((entry) => entry.key === 'href' || entry.key === 'url')
    expect(hrefs.filter((entry) => hipTarget(entry.text)).map((entry) => entry.path)).toEqual([])
    for (const ledger of ledgers) {
      expect(ledger.filter((entry) => hipTarget(entry.href)).map((entry) => entry.label)).toEqual([])
    }
    expect(Object.keys(UPSTREAM_MAP).filter(hipTarget)).toEqual([])
  })
})
