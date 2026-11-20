import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPLOYER_DIGESTS, HEDGES } from './copy-rules.ts'

export type Rule = 'employer' | 'hedge' | 'email' | 'location' | 'emdash'
export type Violation = { rule: Rule; match: string }
export type ScanOptions = { employerDigests?: string[] }

const MAX_NGRAM_WORDS = 3

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hedgePattern = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${HEDGES.map((hedge) => escapeRegExp(hedge).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
)
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const locationPattern = /\bAshburn\b|[-+]?\d{1,3}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,}/gi
const emdashPattern = /\u2014/g
const wordPattern = /[\p{L}\p{N}]+/gu

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function collect(rule: Rule, pattern: RegExp, text: string): Violation[] {
  return Array.from(text.matchAll(pattern), (found) => ({ rule, match: found[0] }))
}

function findEmployers(text: string, digests: string[]): Violation[] {
  const known = new Set(digests)
  const words = Array.from(text.matchAll(wordPattern), (found) => ({
    text: found[0].toLowerCase(),
    start: found.index,
    end: found.index + found[0].length,
  }))
  const violations: Violation[] = []
  for (let first = 0; first < words.length; first++) {
    for (let length = 1; length <= MAX_NGRAM_WORDS && first + length <= words.length; length++) {
      const last = first + length - 1
      const phrase = words.slice(first, last + 1).map((word) => word.text).join(' ')
      if (known.has(sha256(phrase))) {
        violations.push({ rule: 'employer', match: text.slice(words[first].start, words[last].end) })
      }
    }
  }
  return violations
}

export function findViolations(text: string, options: ScanOptions = {}): Violation[] {
  const digests = options.employerDigests ?? EMPLOYER_DIGESTS
  return [
    ...findEmployers(text, digests),
    ...collect('hedge', hedgePattern, text),
    ...collect('email', emailPattern, text),
    ...collect('location', locationPattern, text),
    ...collect('emdash', emdashPattern, text),
  ]
}

const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '\u2014' }

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return namedEntities[String(name).toLowerCase()] ?? whole
  })
}

const textAttributes = new Set(['alt', 'title', 'aria-label', 'aria-description', 'placeholder'])
const valueElements = new Set(['input', 'button'])
const metaKeys = new Set([
  'description',
  'og:title',
  'og:description',
  'og:site_name',
  'og:image:alt',
  'twitter:title',
  'twitter:description',
])
const tagPattern = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi
const attributePattern = /([^\s=/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
const jsonLdPattern = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const found of source.matchAll(attributePattern)) {
    attributes.set(found[1].toLowerCase(), found[2] ?? found[3] ?? found[4] ?? '')
  }
  return attributes
}

function attributeTexts(html: string): string[] {
  const texts: string[] = []
  for (const tag of html.matchAll(tagPattern)) {
    const name = tag[1].toLowerCase()
    const attributes = readAttributes(tag[2])
    for (const [key, value] of attributes) {
      if (textAttributes.has(key) || (key === 'value' && valueElements.has(name))) texts.push(value)
    }
    if (name === 'meta') {
      const key = (attributes.get('name') ?? attributes.get('property') ?? '').toLowerCase()
      if (metaKeys.has(key)) texts.push(attributes.get('content') ?? '')
    }
  }
  return texts
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') return /^https?:/i.test(value) ? [] : [value]
  if (Array.isArray(value)) return value.flatMap(jsonStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(jsonStrings)
  return []
}

function jsonLdTexts(html: string): string[] {
  return Array.from(html.matchAll(jsonLdPattern), (found) => jsonStrings(JSON.parse(found[1]))).flat()
}

export function scanHtml(html: string, options: ScanOptions = {}): Violation[] {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  const hidden = html.replace(/<!--[\s\S]*?-->/g, ' ')
  const extra = [...attributeTexts(hidden), ...jsonLdTexts(hidden)]
  return [visible, ...extra].flatMap((text) => findViolations(decodeEntities(text), options))
}

function listHtmlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return listHtmlFiles(path)
    return path.endsWith('.html') ? [path] : []
  })
}

function main(directory: string | undefined): number {
  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
    console.error(`copy-scan: directory not found: ${directory ?? '(none given)'}`)
    return 2
  }
  let failures = 0
  for (const file of listHtmlFiles(directory)) {
    for (const violation of scanHtml(readFileSync(file, 'utf8'))) {
      console.log(`${file}: ${violation.rule}: ${violation.match}`)
      failures++
    }
  }
  return failures > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv[2]))
}
