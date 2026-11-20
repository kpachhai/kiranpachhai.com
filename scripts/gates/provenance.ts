// Provenance gate: every claim-bearing item in the content model carries a
// usable source. Upstream items have no source field; their href is the source.
import { fileURLToPath } from 'node:url'
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

function checkUpstreamHref(label: string, href: unknown): string[] {
  if (typeof href !== 'string' || href === '') return [`${label}: missing source (href)`]
  return href.startsWith('https://') ? [] : [`${label}: url source must be https`]
}

export function checkProvenance(model: Model): string[] {
  return [
    ...model.proofs.flatMap((item) => checkSource(`proofs[${item.id}]`, item)),
    ...model.materials.flatMap((item) => checkSource(`materials[${item.id}]`, item)),
    ...model.roles.flatMap((item) => checkSource(`roles[${item.title}]`, item)),
    ...model.timeline.flatMap((item) => checkSource(`timeline[${item.title}]`, item)),
    ...model.talks.flatMap((item) => checkSource(`talks[${item.id}]`, item)),
    ...model.methods.flatMap((item) => checkSource(`methods[${item.id}]`, item)),
    ...model.caseStudies.flatMap((item) => [
      ...checkSource(`caseStudies[${item.slug}]`, item),
      ...CASE_STUDY_FIELDS.flatMap((field) => checkSource(`caseStudies[${item.slug}].${field}`, item[field] ?? {})),
    ]),
    ...model.domains.flatMap((domain) => [
      ...checkSource(`domains[${domain.id}]`, domain),
      ...domain.upstream.flatMap((item, index) =>
        checkUpstreamHref(`domains[${domain.id}].upstream[${index}]`, item.href),
      ),
    ]),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { model } = await import('../../src/model/index.ts')
  const problems = checkProvenance(model)
  for (const problem of problems) console.log(problem)
  process.exit(problems.length > 0 ? 1 : 0)
}
