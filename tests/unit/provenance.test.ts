import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { model, type Model } from '../../src/model'
import { checkProvenance } from '../../scripts/gates/provenance'

const clone = (): Model => structuredClone(model)
// Gate input may bypass the schema, so tests loosen types deliberately.
type Loose = Record<string, unknown>

describe('provenance gate', () => {
  it('passes the real model', () => {
    expect(checkProvenance(model)).toEqual([])
  })

  it('names a talk whose source was removed', () => {
    const broken = clone()
    const talk = broken.talks[0] as unknown as Loose
    const id = talk.id
    delete talk.source
    expect(checkProvenance(broken)).toEqual([`talks[${id}]: missing source`])
  })

  it('flags an owner source with a non-ISO or impossible date', () => {
    const broken = clone()
    broken.proofs[0].source = { kind: 'owner', date: '2026-13-45' }
    broken.materials[0].source = { kind: 'owner', date: 'last spring' }
    const problems = checkProvenance(broken)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain(`proofs[${broken.proofs[0].id}]`)
    expect(problems[1]).toContain(`materials[${broken.materials[0].id}]`)
  })

  it('accepts a valid owner date', () => {
    const fine = clone()
    fine.proofs[0].source = { kind: 'owner', date: '2026-02-28' }
    expect(checkProvenance(fine)).toEqual([])
  })

  it('flags a non-https url source', () => {
    const broken = clone()
    broken.roles[0].source = { kind: 'url', url: 'http://example.com' }
    const problems = checkProvenance(broken)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('roles[')
    expect(problems[0]).toContain('https')
  })

  it('treats an upstream href as its source and requires https', () => {
    const broken = clone()
    const domain = broken.domains.find((entry) => entry.upstream.length > 0)!
    domain.upstream[0].href = 'http://example.com/pr/1'
    const problems = checkProvenance(broken)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`domains[${domain.id}].upstream[0]`)
  })

  it('flags missing sources on timeline, methods, domains and case studies', () => {
    const broken = clone()
    delete (broken.timeline[0] as unknown as Loose).source
    delete (broken.methods[0] as unknown as Loose).source
    delete (broken.domains[0] as unknown as Loose).source
    delete (broken.caseStudies[0] as unknown as Loose).source
    expect(checkProvenance(broken)).toHaveLength(4)
  })

  it('names a case-study field whose source was removed', () => {
    const broken = clone()
    const study = broken.caseStudies[0]
    delete (study.outcome as unknown as Loose).source
    expect(checkProvenance(broken)).toEqual([`caseStudies[${study.slug}].outcome: missing source`])
  })

  it('exits 0 from the CLI on the real model', () => {
    const run = spawnSync('node', ['--import', './scripts/gates/ts-resolve.mjs', 'scripts/gates/provenance.ts'], { encoding: 'utf8' })
    expect(run.status).toBe(0)
  })
})
