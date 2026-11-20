// Build-time text for a claim's source, shown by the provenance toggle.
// A URL source shows its address. Inside a path segment, the part that would put an employer name,
// a hedge word or a HIP number in visible text is shown as an ellipsis; the link still goes to the
// real address.
import { findViolations, type ScanOptions } from '../../scripts/gates/copy-scan'
import type { Source } from '../model'

export interface SourceLabel {
  kind: Source['kind']
  text: string
  href?: string
}

const ELIDED = '\u2026'
const HIP_NUMBER = /hip-?\d+/gi
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function elide(segment: string, options: ScanOptions): string {
  const withoutHip = segment.replace(HIP_NUMBER, ELIDED)
  return findViolations(withoutHip, options).reduce(
    (text, violation) => text.replace(new RegExp(escapeRegExp(violation.match), 'gi'), ELIDED),
    withoutHip,
  )
}

export function urlText(address: string, options: ScanOptions = {}): string {
  const url = new URL(address)
  const segments = url.pathname.split('/').filter(Boolean)
  return [url.host, ...segments.map((segment) => elide(segment, options))].join('/')
}

export function sourceLabel(source: Source, options: ScanOptions = {}): SourceLabel {
  if (source.kind === 'url') return { kind: 'url', text: urlText(source.url, options), href: source.url }
  // LinkedIn is named, not linked: the profile is linked once, from the footer.
  if (source.kind === 'linkedin') return { kind: 'linkedin', text: 'LinkedIn' }
  return { kind: 'owner', text: `Owner, ${source.date}` }
}
