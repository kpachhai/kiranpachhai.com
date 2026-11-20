import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { model, type Model } from '../../src/model'
import { ModelSchema } from '../../src/model/schema'
import { checkProvenance } from '../../scripts/gates/provenance'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'

const clone = (): Model => structuredClone(model)
// Gate input may bypass the schema, so tests loosen types deliberately.
type Loose = Record<string, unknown>

describe('provenance gate', () => {
  it('passes the real model', () => {
    expect(checkProvenance(model)).toEqual([])
  })

  it('flags a hero line without a source', () => {
    const broken = clone()
    delete (broken.hero as unknown as Loose).source
    expect(checkProvenance(broken)).toEqual(['hero: missing source'])
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

  it('treats an upstream link href as its source, requires https and keeps it inside its repo', () => {
    const repo = 'hashgraph/hedera-docs'
    const withLink = (href: string) => ({ ...UPSTREAM_MAP, [repo]: { ...UPSTREAM_MAP[repo]!, links: [{ href, note: 'a note' }] } })
    expect(checkProvenance(clone(), withLink(`https://github.com/${repo}/pull/1`))).toEqual([])
    const insecure = checkProvenance(clone(), withLink(`http://github.com/${repo}/pull/1`))
    expect(insecure).toHaveLength(1)
    expect(insecure[0]).toContain(`upstream[${repo}].links[0]`)
    expect(insecure[0]).toContain('https')
    const elsewhere = checkProvenance(clone(), withLink('https://github.com/someone/else/pull/1'))
    expect(elsewhere).toEqual([`upstream[${repo}].links[0]: link sits outside ${repo}`])
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

  it('exits 1 from the CLI and names the claim when a source is missing', () => {
    const broken = clone()
    const talk = broken.talks[0] as unknown as Loose
    delete talk.source
    const directory = mkdtempSync(join(tmpdir(), 'provenance-'))
    const file = join(directory, 'model.mjs')
    writeFileSync(file, `export const model = ${JSON.stringify(broken)}\n`)
    const run = spawnSync('node', ['--import', './scripts/gates/ts-resolve.mjs', 'scripts/gates/provenance.ts', file], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stdout).toContain(`talks[${String(talk.id)}]: missing source`)
  })

  it('accepts a LinkedIn source and flags an unknown kind', () => {
    const broken = clone()
    broken.proofs[0].source = { kind: 'linkedin' }
    expect(checkProvenance(broken)).toEqual([])
    ;(broken.proofs[0] as unknown as Loose).source = { kind: 'rumour' }
    expect(checkProvenance(broken)).toEqual([`proofs[${broken.proofs[0].id}]: unknown source kind`])
  })

  // Every collection the schema gives a source must be walked: dropping the source from its first
  // item has to produce a problem. A new sourced collection fails here until the gate covers it.
  it('walks every sourced collection in the schema', () => {
    const shape = ModelSchema.shape as Record<string, unknown>
    const sourced = Object.entries(shape).filter(([, schema]) => {
      const element = (schema as { element?: { shape?: Record<string, unknown> } }).element
      return element?.shape !== undefined && 'source' in element.shape
    })
    expect(sourced.length).toBeGreaterThan(5)
    for (const [key] of sourced) {
      const broken = clone() as unknown as Record<string, Loose[]>
      const items = broken[key]
      expect(items.length, key).toBeGreaterThan(0)
      delete items[0].source
      expect(checkProvenance(broken as unknown as Model).some((problem) => problem.startsWith(`${key}[`)), key).toBe(true)
    }
  })
})

describe('ts-resolve hook', () => {
  it('resolves a dotted extensionless name and a directory import to their .ts files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ts-resolve-'))
    mkdirSync(join(directory, 'data'))
    writeFileSync(join(directory, 'site.config.ts'), "export const name: string = 'config'\n")
    writeFileSync(join(directory, 'data', 'index.ts'), "export const rows: number = 2\n")
    writeFileSync(join(directory, 'main.ts'), "import { name } from './site.config'\nimport { rows } from './data'\nconsole.log(`${name} ${rows}`)\n")
    const hook = join(process.cwd(), 'scripts', 'gates', 'ts-resolve.mjs')
    const run = spawnSync('node', ['--import', pathToFileURL(hook).href, join(directory, 'main.ts')], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    expect(run.stdout.trim()).toBe('config 2')
  })
})
