import { describe, expect, it } from 'vitest'
import { sourceLabel, urlText } from '../../src/lib/provenance'
import { findViolations } from '../../scripts/gates/copy-scan'
import { model } from '../../src/model'

// sha256('acme'): a stand-in employer so this test never names a real one.
const FAKE = { employerDigests: ['822b33ad87c148a0a20a5ba7cd5ebcaa68d36a18e7aad165554903f52ca82757'] }

describe('source labels', () => {
  it('shows a url source as host and path, linked to the address', () => {
    expect(sourceLabel({ kind: 'url', url: 'https://github.com/kpachhai/signscope-snap' }, FAKE)).toEqual({
      kind: 'url',
      text: 'github.com/kpachhai/signscope-snap',
      href: 'https://github.com/kpachhai/signscope-snap',
    })
  })

  it('elides a path segment that names an employer and keeps the real link', () => {
    const label = sourceLabel({ kind: 'url', url: 'https://github.com/acme/docs/pull/3' }, FAKE)
    expect(label.text).toBe('github.com/…/docs/pull/3')
    expect(label.href).toBe('https://github.com/acme/docs/pull/3')
  })

  it('elides only the hedge word inside a segment', () => {
    expect(urlText('https://example.com/notes/draft-two', FAKE)).toBe('example.com/notes/\u2026-two')
  })

  it('elides only the employer name inside a segment', () => {
    expect(urlText('https://github.com/someone/acme-docs', FAKE)).toBe('github.com/someone/\u2026-docs')
  })

  it('elides only the HIP number inside a segment', () => {
    expect(urlText('https://github.com/kpachhai/hip-1215-simple-contracts-demo', FAKE)).toBe('github.com/kpachhai/\u2026-simple-contracts-demo')
  })

  it('shows LinkedIn and owner sources by name with no link, owner with its date', () => {
    expect(sourceLabel({ kind: 'linkedin' })).toEqual({ kind: 'linkedin', text: 'LinkedIn' })
    expect(sourceLabel({ kind: 'owner', date: '2026-11-19' })).toEqual({ kind: 'owner', text: 'Owner, 2026-11-19' })
  })

  it('gives every source in the model a label that passes the copy rules', () => {
    const sources = [
      ...model.proofs,
      ...model.materials,
      ...model.methods,
      ...model.timeline,
      ...model.talks,
      ...model.caseStudies.flatMap((study) => [study, study.problem, study.approach, study.methods, study.outcome]),
    ].map((item) => item.source)
    const bad = sources.map((source) => sourceLabel(source).text).filter((text) => findViolations(text).length > 0 || /hip-?\d/i.test(text))
    expect(bad).toEqual([])
  })
})
