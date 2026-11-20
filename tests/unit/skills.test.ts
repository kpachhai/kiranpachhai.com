import { describe, expect, it } from 'vitest'
import { findViolations } from '../../scripts/gates/copy-scan'
import { checkProvenance } from '../../scripts/gates/provenance'
import { buildIslandData } from '../../src/island/data'
import { sourceLabel } from '../../src/lib/provenance'
import { upstream } from '../../src/lib/site'
import { cycleTitles, model, type Model } from '../../src/model'
import { HAT_IDS, SKILL_SETS } from '../../src/model/schema'

const CURRENT_YEAR = new Date().getFullYear()
const OLD_PORTFOLIO = 'https://github.com/kpachhai/kiranpachhai.com/blob/c3f14c8/src/data/portfolio.json'
const skillIds = new Set(model.skills.map((skill) => skill.id))
const roleIds = new Set(model.roles.map((role) => role.id))
const proofIds = new Set(model.proofs.map((proof) => proof.id))

// "2016-2018" -> [2016, 2018]; "2025 to now" -> [2025, current year].
function span(years: string): [number, number] {
  const found = (years.match(/\d{4}/g) ?? []).map(Number)
  return [found[0], /now/.test(years) ? CURRENT_YEAR : (found[1] ?? found[0])]
}

// Every string a visitor can read: everything except link targets and source URLs.
function visibleStrings(value: unknown, key?: string, out: string[] = []): string[] {
  if (key === 'href' || key === 'url') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => visibleStrings(item, undefined, out))
  else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) visibleStrings(child, childKey, out)
  return out
}

describe('skills', () => {
  it('gives every skill a source and a first year between 2010 and the current year', () => {
    expect(model.skills.length).toBeGreaterThan(20)
    for (const skill of model.skills) {
      expect(skill.source, skill.id).toBeDefined()
      expect(Number.isInteger(skill.firstYear), skill.id).toBe(true)
      expect(skill.firstYear, skill.id).toBeGreaterThanOrEqual(2010)
      expect(skill.firstYear, skill.id).toBeLessThanOrEqual(CURRENT_YEAR)
    }
  })

  it('has unique ids, and every skill sits in one of the four sets', () => {
    expect(skillIds.size).toBe(model.skills.length)
    for (const skill of model.skills) expect(SKILL_SETS, skill.id).toContain(skill.set)
    for (const set of SKILL_SETS) expect(model.skills.some((skill) => skill.set === set), set).toBe(true)
  })

  it('lists exactly the eight languages and no Rust', () => {
    expect(model.skills.filter((skill) => skill.set === 'language').map((skill) => skill.name)).toEqual([
      'Solidity',
      'TypeScript',
      'JavaScript',
      'Go',
      'Python',
      'Java',
      'Bash',
      'SQL',
    ])
    expect(JSON.stringify(model.skills)).not.toMatch(/\brust\b/i)
  })

  it('lists the nine kinds of work the owner named, plus testing and CI/CD', () => {
    expect(model.skills.filter((skill) => skill.set === 'work').map((skill) => skill.name)).toEqual([
      'Protocol and L1 design',
      'Smart contract engineering',
      'Wallets and identity',
      'Backend APIs and services',
      'SRE and observability',
      'Data systems',
      'Solutions architecture',
      'Product ownership',
      'Developer education',
      'Unit and integration testing',
      'CI/CD',
    ])
  })

  it('dates each skill from the LinkedIn addendum and the site repository', () => {
    const year = (id: string) => model.skills.find((skill) => skill.id === id)?.firstYear
    expect({
      bash: year('bash'),
      python: year('python'),
      java: year('java'),
      mongodb: year('mongodb'),
      ipfs: year('ipfs'),
      grafana: year('grafana'),
      prometheus: year('prometheus'),
      docker: year('docker'),
      postgresql: year('postgresql'),
      aws: year('aws'),
      gcp: year('gcp'),
      cicd: year('ci-cd'),
      testing: year('testing'),
      unix: year('unix'),
      astro: year('astro'),
      vitest: year('vitest'),
      playwright: year('playwright'),
    }).toEqual({
      bash: 2014,
      python: 2014,
      java: 2012,
      mongodb: 2020,
      ipfs: 2018,
      grafana: 2016,
      prometheus: 2016,
      docker: 2016,
      postgresql: 2018,
      aws: 2020,
      gcp: 2020,
      cicd: 2020,
      testing: 2014,
      unix: 2014,
      astro: 2026,
      vitest: 2026,
      playwright: 2026,
    })
    const SITE_PACKAGE = 'https://github.com/kpachhai/kiranpachhai.com/blob/main/package.json'
    for (const id of ['astro', 'vitest', 'playwright']) {
      const skill = model.skills.find((item) => item.id === id)!
      expect(skill.set, id).toBe('tool')
      expect(skill.source, id).toEqual({ kind: 'url', url: SITE_PACKAGE })
    }
  })

  it('points evidence only at roles and proofs that exist', () => {
    for (const skill of model.skills) {
      for (const id of skill.evidence.roleIds ?? []) expect(roleIds.has(id), `${skill.id} -> role ${id}`).toBe(true)
      for (const id of skill.evidence.proofIds ?? []) expect(proofIds.has(id), `${skill.id} -> proof ${id}`).toBe(true)
    }
  })

  it('is added by exactly one role, whose years contain its first year', () => {
    for (const skill of model.skills) {
      const adders = model.roles.filter((role) => role.skillsAdded.includes(skill.id))
      expect(adders.map((role) => role.id), skill.id).toHaveLength(1)
      const [start, end] = span(adders[0].years)
      expect(skill.firstYear, `${skill.id} in ${adders[0].id}`).toBeGreaterThanOrEqual(start)
      expect(skill.firstYear, `${skill.id} in ${adders[0].id}`).toBeLessThanOrEqual(end)
    }
  })
})

describe('roles', () => {
  it('runs from the 2011 student roles to now in order, one stop per role', () => {
    const starts = model.roles.map((role) => span(role.years)[0])
    expect(starts[0]).toBe(2011)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(model.roles.at(-1)!.years).toMatch(/now/)
    expect(roleIds.size).toBe(model.roles.length)
  })

  it("references only skills and hats that exist in every role's skillsAdded and hats", () => {
    for (const role of model.roles) {
      for (const id of role.skillsAdded) expect(skillIds.has(id), `${role.id} -> ${id}`).toBe(true)
      expect(role.hats.length, role.id).toBeGreaterThan(0)
      for (const hat of role.hats) expect(HAT_IDS, `${role.id} -> ${hat}`).toContain(hat)
      expect(new Set(role.hats).size, role.id).toBe(role.hats.length)
    }
    expect(model.hats.map((hat) => hat.id)).toEqual([...HAT_IDS])
  })

  it('gives every role two to four work bullets with a source', () => {
    for (const role of model.roles) {
      expect(role.work.items.length, role.id).toBeGreaterThanOrEqual(2)
      expect(role.work.items.length, role.id).toBeLessThanOrEqual(4)
      expect(role.work.source, role.id).toBeDefined()
    }
  })

  it('shows the four owner-approved figures as text with an owner source and no link', () => {
    const figures = model.roles.flatMap((role) => role.figures)
    const text = figures.map((figure) => figure.text).join(' | ')
    for (const phrase of ['within a 4-week deadline', 'millions of syslog messages per minute', 'hundreds of servers', 'petabytes']) {
      expect(text).toContain(phrase)
    }
    for (const figure of figures) {
      expect(figure.source).toEqual({ kind: 'owner', date: '2026-11-20' })
      expect(Object.keys(figure).sort()).toEqual(['source', 'text'])
    }
  })

  it('adds Python, Bash, testing and Unix administration at the 2014-2016 stop', () => {
    const stop = model.roles.find((role) => role.id === 'software-engineer')!
    expect(stop.skillsAdded).toEqual(['testing', 'python', 'bash', 'unix'])
  })

  it('gives each role the same years in the Timeline as in the Journey', () => {
    const timelineRoles = model.timeline.filter((entry) => entry.kind === 'role')
    expect(timelineRoles.map((entry) => entry.title).sort()).toEqual(model.roles.map((role) => role.title).sort())
    for (const role of model.roles) {
      expect(timelineRoles.find((entry) => entry.title === role.title)?.years, role.id).toBe(role.years)
    }
  })

  it('words each work bullet no stronger than its source', () => {
    const bullets = model.roles.flatMap((role) => role.work.items)
    expect(bullets).toContain('Worked on migrating the developer tools platform, and built tools for other developers')
    expect(bullets.some((item) => item.startsWith('Wrote most of the code for two MetaMask Snaps'))).toBe(true)
    expect(bullets.some((item) => item.startsWith('Built two MetaMask Snaps'))).toBe(false)
  })

  it('cites the source that carries each dated year', () => {
    const skill = (id: string) => model.skills.find((item) => item.id === id)!
    expect(skill('react').source).toEqual({ kind: 'linkedin' })
    expect(skill('hedera-sdks').source).toEqual({ kind: 'url', url: 'https://github.com/tuum-tech/identify/pull/2' })
  })

  it('gives the hero role cycle one short title for each role after the student years', () => {
    expect(cycleTitles).toEqual(['software engineer', 'SRE', 'developer relations engineer', 'technical lead', 'course instructor', 'blockchain architect', 'developer advocate'])
  })
})

describe('career projects from the old site', () => {
  const projects = model.roles.flatMap((role) => role.projects)

  it('adds the CLI tool, the API service and the web dashboard, sourced to the old site file', () => {
    for (const label of ['Blockchain CLI tool for private networks', 'Blockchain API service', 'Blockchain web dashboard']) {
      const project = projects.find((item) => item.label === label)
      expect(project, label).toBeDefined()
      expect(project!.href, label).toBeUndefined()
      expect(project!.source, label).toEqual({ kind: 'url', url: OLD_PORTFOLIO })
    }
  })

  it('links only the live targets', () => {
    const hrefs = projects.flatMap((item) => (item.href ? [item.href] : [])).sort()
    expect(hrefs).toEqual(['https://github.com/tuum-tech/assist-service'])
  })

  it('has unique project ids', () => {
    expect(new Set(projects.map((item) => item.id)).size).toBe(projects.length)
  })
})

describe('copy rules over the model', () => {
  it('contains no MTRL anywhere, links included', () => {
    expect(JSON.stringify(model)).not.toMatch(/mtrl/i)
  })

  it('names no employer in any visible string of the roles and skills', () => {
    const strings = visibleStrings({ roles: model.roles, skills: model.skills, hats: model.hats })
    expect(strings.length).toBeGreaterThan(50)
    expect(strings.flatMap((text) => findViolations(text).map((v) => `${v.rule}: ${v.match}`))).toEqual([])
  })

  it('names no HIP number and no years-of-experience figure in the roles', () => {
    const text = visibleStrings(model.roles).join(' ')
    expect(text).not.toMatch(/HIP-?\s?\d/i)
    expect(text).not.toMatch(/\d+\+?\s+years/i)
  })
})

describe('provenance gate covers the career', () => {
  const clone = (): Model => structuredClone(model)

  it('flags a skill, a figure, a project and a work list without a source', () => {
    const broken = clone()
    const loose = (value: object) => value as unknown as Record<string, unknown>
    delete loose(broken.skills[0]).source
    const withFigure = broken.roles.find((role) => role.figures.length > 0)!
    delete loose(withFigure.figures[0]).source
    const withProject = broken.roles.find((role) => role.projects.length > 0)!
    delete loose(withProject.projects[0]).source
    delete loose(broken.roles[0].work).source
    const problems = checkProvenance(broken)
    expect(problems).toHaveLength(4)
    expect(problems.join('\n')).toContain(`skills[${broken.skills[0].id}]`)
  })
})

describe('island data for the Range roles x hats view', () => {
  const data = buildIslandData(model, (source) => sourceLabel(source), upstream)

  it('carries each role with its hats and the seven hats in order', () => {
    expect(data.career.map((role) => role.id)).toEqual(model.roles.map((role) => role.id))
    expect(data.career.map((role) => role.hats)).toEqual(model.roles.map((role) => role.hats))
    expect(data.hats.map((hat) => hat.id)).toEqual([...HAT_IDS])
    expect(data.roles.map((role) => role.title)).toEqual(cycleTitles)
  })
})

// The bill of materials and the toolkit describe the same parts: a part that is also a skill sits
// in the same group and carries the same source in both, so it has one first year and one source.
describe('bill of materials and toolkit agree', () => {
  const skillById = new Map(model.skills.map((skill) => [skill.id, skill]))
  const shared = model.materials.filter((material) => skillById.has(material.id))

  it('shares every language, framework and tool part with the toolkit', () => {
    const nonDiscipline = model.materials.filter((material) => material.band !== 'discipline')
    expect(shared.map((material) => material.id)).toEqual(nonDiscipline.map((material) => material.id))
  })

  it('puts each shared part in the toolkit group of the same name', () => {
    for (const material of shared) expect(material.band, material.id).toBe(skillById.get(material.id)!.set)
  })

  it('gives each shared part the toolkit source', () => {
    for (const material of shared) expect(material.source, material.id).toEqual(skillById.get(material.id)!.source)
  })
})
