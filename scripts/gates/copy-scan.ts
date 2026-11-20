import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPOUND_DIGESTS, EMPLOYER_DIGESTS, HEDGES } from './copy-rules.ts'

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
// The parts of a compound word at its case and digit breaks: "AcmeVM" reads as "Acme VM".
const wordPartPattern = /\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{Lo}+/gu

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function collect(rule: Rule, pattern: RegExp, text: string): Violation[] {
  return Array.from(text.matchAll(pattern), (found) => ({ rule, match: found[0] }))
}

type Word = { text: string; start: number; end: number }

// 1- to 3-word runs of words, each hashed and compared; a hit reports the original text.
function ngramHits(words: Word[], known: Set<string>, text: string): Violation[] {
  const violations: Violation[] = []
  for (let first = 0; first < words.length; first++) {
    for (let length = 1; length <= MAX_NGRAM_WORDS && first + length <= words.length; length++) {
      const last = first + length - 1
      const phrase = words.slice(first, last + 1).map((word) => word.text).join(' ')
      // A plural ("...s") counts as the term it pluralises.
      const singular = phrase.length > 1 && phrase.endsWith('s') ? phrase.slice(0, -1) : null
      if (known.has(sha256(phrase)) || (singular !== null && known.has(sha256(singular)))) {
        violations.push({ rule: 'employer', match: text.slice(words[first].start, words[last].end) })
      }
    }
  }
  return violations
}

function findEmployers(text: string, digests: string[]): Violation[] {
  const known = new Set(digests)
  const found = Array.from(text.matchAll(wordPattern))
  const words = found.map((match) => ({ text: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length }))
  const violations = ngramHits(words, known, text)
  // A one-word product name that joins an employer term to another word at a case break
  // ("AcmeVM", "AcmeCorpHub") is read again as its parts; a hit reports the whole word.
  for (const [position, match] of found.entries()) {
    const parts = match[0].match(wordPartPattern) ?? []
    if (parts.length < 2) continue
    const word = words[position]
    const inner = parts.map((part) => ({ text: part.toLowerCase(), start: word.start, end: word.end }))
    for (const hit of ngramHits(inner, known, text)) {
      if (!violations.some((violation) => violation.match === hit.match)) violations.push(hit)
    }
  }
  return violations
}

export const DEFAULT_EMPLOYER_DIGESTS: readonly string[] = [...EMPLOYER_DIGESTS, ...COMPOUND_DIGESTS]

export function findViolations(text: string, options: ScanOptions = {}): Violation[] {
  const digests = options.employerDigests ?? [...DEFAULT_EMPLOYER_DIGESTS]
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
// A ">" inside a quoted attribute value does not end the tag.
const tagPattern = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const anyTagPattern = /<\/?[a-z][a-z0-9-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>|<\/?[a-z][a-z0-9-]*>|<![^>]*>/gi
// Inline elements do not break a word, so a term split across them ("Acme<b>corp</b>") is also read joined.
const inlineTagPattern = /<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const scriptOrStylePattern = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi
const attributePattern = /([^\s=/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
// ld+json, and JSON data blocks such as the island's labels, are read as copy; other scripts are not.
const jsonScriptPattern = /<script\b[^>]*\btype\s*=\s*["']?application\/(ld\+)?json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi

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

export class InvalidJsonLd extends Error {}

function jsonScriptTexts(html: string): string[] {
  return Array.from(html.matchAll(jsonScriptPattern), (found) => {
    try {
      return jsonStrings(JSON.parse(found[2]))
    } catch (error) {
      throw new InvalidJsonLd(`invalid ${found[1] ? 'ld+json' : 'JSON data'}: ${(error as Error).message}`)
    }
  }).flat()
}

function dedupe(found: Violation[]): Violation[] {
  const seen = new Set<string>()
  return found.filter((violation) => {
    const key = `${violation.rule}\u0000${violation.match}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Quoted and template string literals in built JavaScript. A regex literal holding a quote can pair
// quotes wrongly; that only adds code text to the scan, so it can over-report but never hide copy.
const jsStringPattern = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g
const jsEscapePattern = /\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|(.))/gis
const simpleEscapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }

function decodeJsEscapes(text: string): string {
  return text.replace(jsEscapePattern, (_whole, braced, unicode, hex, other: string | undefined) => {
    const code = braced ?? unicode ?? hex
    if (code) return String.fromCodePoint(parseInt(code, 16))
    return other === undefined ? '' : (simpleEscapes[other] ?? other)
  })
}

// The copy inside a built JavaScript bundle: every string literal, escapes decoded.
export function scanJs(source: string, options: ScanOptions = {}): Violation[] {
  const literals = Array.from(source.matchAll(jsStringPattern), (found) => decodeJsEscapes(found[0].slice(1, -1)))
  return dedupe(literals.flatMap((text) => findViolations(text, options)))
}

export function scanHtml(html: string, options: ScanOptions = {}): Violation[] {
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, ' ')
  // Script and style bodies are code, not copy: tag-like strings inside them are never read as markup.
  const markup = uncommented.replace(scriptOrStylePattern, ' ')
  const visible = markup.replace(anyTagPattern, ' ')
  const joined = markup.replace(inlineTagPattern, '').replace(anyTagPattern, ' ')
  const texts = [visible, joined, ...attributeTexts(markup), ...jsonScriptTexts(uncommented)]
  const found = texts.flatMap((text) => findViolations(decodeEntities(text), options))
  // The joined reading repeats every hit the spaced one has; report each rule and match once.
  return dedupe(found)
}

function listScannedFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return listScannedFiles(path)
    return path.endsWith('.html') || path.endsWith('.js') ? [path] : []
  })
}

function main(directory: string | undefined): number {
  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
    console.error(`copy-scan: directory not found: ${directory ?? '(none given)'}`)
    return 2
  }
  const files = listScannedFiles(directory)
  // A directory with nothing to scan is a wrong path or an empty build, never a pass.
  if (files.length === 0) {
    console.error(`copy-scan: no .html or .js files under ${directory}; nothing was scanned`)
    return 2
  }
  let failures = 0
  let unreadable = 0
  for (const file of files) {
    let violations: Violation[]
    try {
      const text = readFileSync(file, 'utf8')
      violations = file.endsWith('.js') ? scanJs(text) : scanHtml(text)
    } catch (error) {
      if (!(error instanceof InvalidJsonLd)) throw error
      console.error(`${file}: ${error.message}`)
      unreadable++
      continue
    }
    for (const violation of violations) {
      console.log(`${file}: ${violation.rule}: ${violation.match}`)
      failures++
    }
  }
  if (unreadable > 0) return 2
  return failures > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv[2]))
}
