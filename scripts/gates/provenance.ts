// Provenance gate: every claim-bearing item in the content model carries a
// usable source. Upstream links have no source field; their href is the source, and it must sit
// inside the repo the upstream map files it under.
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { UPSTREAM_MAP } from '../../src/data/upstream-map'
import type { Model } from '../../src/model/schema'

type Loose = { source?: { kind?: string; url?: string; date?: string } }

const CASE_STUDY_FIELDS = ['problem', 'approach', 'methods', 'outcome'] as const

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRealDate(value: string): boolean {
  const parts = ISO_DATE.exec(value)
  if (!parts) return false
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function checkSource(label: string, item: Loose): string[] {
  const source = item.source
  if (!source) return [`${label}: missing source`]
  if (source.kind === 'url') {
    return typeof source.url === 'string' && source.url.startsWith('https://')
      ? []
      : [`${label}: url source must be https`]
  }
  if (source.kind === 'owner') {
    return typeof source.date === 'string' && isRealDate(source.date)
      ? []
      : [`${label}: owner source needs a real ISO date (YYYY-MM-DD)`]
  }
  if (source.kind === 'linkedin') return []
  return [`${label}: unknown source kind`]
}

function checkUpstreamHref(label: string, href: unknown, repo: string): string[] {
  if (typeof href !== 'string' || href === '') return [`${label}: missing source (href)`]
  if (!href.startsWith('https://')) return [`${label}: url source must be https`]
  return href.startsWith(`https://github.com/${repo}/`) ? [] : [`${label}: link sits outside ${repo}`]
}

export function checkProvenance(model: Model, upstreamMap: typeof UPSTREAM_MAP = UPSTREAM_MAP): string[] {
  return [
    ...checkSource('hero', model.hero),
    ...model.proofs.flatMap((item) => checkSource(`proofs[${item.id}]`, item)),
    ...model.materials.flatMap((item) => checkSource(`materials[${item.id}]`, item)),
    ...model.roles.flatMap((item) => [
      ...checkSource(`roles[${item.title}]`, item),
      ...checkSource(`roles[${item.title}].work`, item.work ?? {}),
      ...(item.figures ?? []).flatMap((figure, index) => checkSource(`roles[${item.title}].figures[${index}]`, figure)),
      ...(item.projects ?? []).flatMap((project) => checkSource(`roles[${item.title}].projects[${project.id}]`, project)),
    ]),
    ...(model.skills ?? []).flatMap((item) => checkSource(`skills[${item.id}]`, item)),
    ...model.timeline.flatMap((item) => checkSource(`timeline[${item.title}]`, item)),
    ...model.talks.flatMap((item) => checkSource(`talks[${item.id}]`, item)),
    ...model.methods.flatMap((item) => checkSource(`methods[${item.id}]`, item)),
    ...model.caseStudies.flatMap((item) => [
      ...checkSource(`caseStudies[${item.slug}]`, item),
      ...CASE_STUDY_FIELDS.flatMap((field) => checkSource(`caseStudies[${item.slug}].${field}`, item[field] ?? {})),
    ]),
    ...model.domains.flatMap((domain) => checkSource(`domains[${domain.id}]`, domain)),
    ...Object.entries(upstreamMap).flatMap(([repo, entry]) =>
      (entry.links ?? []).flatMap((link, index) => checkUpstreamHref(`upstream[${repo}].links[${index}]`, link.href, repo)),
    ),
  ]
}

// The CLI checks the site's model; a path argument checks another module's exported model instead.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '../../src/model/index.ts'
  const { model } = (await import(target)) as { model: Model }
  const problems = checkProvenance(model)
  for (const problem of problems) console.log(problem)
  process.exit(problems.length > 0 ? 1 : 0)
}
