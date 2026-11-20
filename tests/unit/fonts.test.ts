import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'

const FONTS = join(process.cwd(), 'public', 'fonts')
const ITALIC = 'newsreader-thesis-wght-italic.woff2'
const DISPLAY = 'bricolage-grotesque-latin-wght-wdth82-normal.woff2'

// WOFF2 (https://www.w3.org/TR/WOFF2/): read the table directory, inflate the one Brotli stream and
// return the requested table's bytes. The cmap and fvar tables are never transformed.
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill']

function woff2Table(bytes: Buffer, wanted: string): Buffer {
  expect(bytes.toString('latin1', 0, 4)).toBe('wOF2')
  const numTables = bytes.readUInt16BE(12)
  const compressedSize = bytes.readUInt32BE(20)
  let at = 48
  const base128 = () => {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = bytes[at++]
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
    throw new Error('bad UIntBase128')
  }
  const tables: { tag: string; length: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = bytes[at++]
    const tag = (flags & 0x3f) === 0x3f ? bytes.toString('latin1', at, (at += 4)) : KNOWN_TAGS[flags & 0x3f]
    const version = flags >> 6
    const origLength = base128()
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    tables.push({ tag, length: transformed ? base128() : origLength })
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + compressedSize))
  let offset = 0
  for (const table of tables) {
    if (table.tag === wanted) return data.subarray(offset, offset + table.length)
    offset += table.length
  }
  throw new Error(`no ${wanted} table`)
}

// Code points mapped by the cmap's format 4 or format 12 subtable.
function codePoints(cmap: Buffer): Set<number> {
  const found = new Set<number>()
  const count = cmap.readUInt16BE(2)
  for (let i = 0; i < count; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4)
    const format = cmap.readUInt16BE(sub)
    if (format === 4) {
      const segments = cmap.readUInt16BE(sub + 6) / 2
      const ends = sub + 14
      const starts = ends + segments * 2 + 2
      for (let s = 0; s < segments; s++) {
        const end = cmap.readUInt16BE(ends + s * 2)
        const start = cmap.readUInt16BE(starts + s * 2)
        for (let c = start; c <= end && c !== 0xffff; c++) found.add(c)
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const start = cmap.readUInt32BE(sub + 16 + g * 12)
        const end = cmap.readUInt32BE(sub + 20 + g * 12)
        for (let c = start; c <= end; c++) found.add(c)
      }
    }
  }
  return found
}

// The fvar axes as [tag, min, max].
function axes(fvar: Buffer): [string, number, number][] {
  const offset = fvar.readUInt16BE(4)
  const count = fvar.readUInt16BE(8)
  const size = fvar.readUInt16BE(10)
  return Array.from({ length: count }, (_, i) => {
    const record = offset + i * size
    return [fvar.toString('latin1', record, record + 4), fvar.readInt32BE(record + 4) / 65536, fvar.readInt32BE(record + 12) / 65536]
  })
}

const font = (name: string) => readFileSync(join(FONTS, name))

describe('self-hosted fonts', () => {
  it('give every character of the hero thesis a real italic glyph, and the CSS range names them all', () => {
    const mapped = codePoints(woff2Table(font(ITALIC), 'cmap'))
    const needed = [...new Set(model.hero.thesis)].map((char) => char.codePointAt(0)!)
    expect(needed.filter((point) => !mapped.has(point)).map((point) => String.fromCodePoint(point))).toEqual([])
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8')
    const range = css.match(/font-style: italic;[\s\S]*?unicode-range: ([^;]+);/)?.[1] ?? ''
    const ranges = range.split(',').map((part) => part.trim().replace('U+', '').split('-').map((hex) => parseInt(hex, 16)))
    const inRange = (point: number) => ranges.some(([start, end = start]) => point >= start && point <= end)
    expect(needed.filter((point) => !inRange(point)).map((point) => String.fromCodePoint(point))).toEqual([])
  })

  it('ship the display face as a condensed cut with a variable weight only', () => {
    expect(axes(woff2Table(font(DISPLAY), 'fvar'))).toEqual([['wght', 200, 800]])
    // OS/2 usWidthClass: 5 is normal, 4 semi-condensed (the 82% instance).
    expect(woff2Table(font(DISPLAY), 'OS/2').readUInt16BE(6)).toBe(4)
  })

  it('stay inside the budget: display preload at most 40 KB, all fonts at most 110 KB', () => {
    const files = readdirSync(FONTS).filter((name) => name.endsWith('.woff2'))
    const total = files.reduce((sum, name) => sum + statSync(join(FONTS, name)).size, 0)
    expect(statSync(join(FONTS, DISPLAY)).size).toBeLessThanOrEqual(40 * 1024)
    expect(statSync(join(FONTS, DISPLAY)).size + statSync(join(FONTS, ITALIC)).size).toBeLessThanOrEqual(40 * 1024)
    expect(total).toBeLessThanOrEqual(110 * 1024)
  })
})

// The glyph ID a code point maps to, from the cmap's format 4 or format 12 subtable (0 if unmapped).
function glyphId(cmap: Buffer, codePoint: number): number {
  const count = cmap.readUInt16BE(2)
  for (let i = 0; i < count; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4)
    const format = cmap.readUInt16BE(sub)
    if (format === 4) {
      const segments = cmap.readUInt16BE(sub + 6) / 2
      const ends = sub + 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const rangeOffsets = deltas + segments * 2
      for (let s = 0; s < segments; s++) {
        const start = cmap.readUInt16BE(starts + s * 2)
        if (codePoint < start || codePoint > cmap.readUInt16BE(ends + s * 2)) continue
        const delta = cmap.readInt16BE(deltas + s * 2)
        const rangeOffset = cmap.readUInt16BE(rangeOffsets + s * 2)
        if (rangeOffset === 0) return (codePoint + delta) & 0xffff
        const glyph = cmap.readUInt16BE(rangeOffsets + s * 2 + rangeOffset + (codePoint - start) * 2)
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const start = cmap.readUInt32BE(sub + 16 + g * 12)
        if (codePoint >= start && codePoint <= cmap.readUInt32BE(sub + 20 + g * 12)) return cmap.readUInt32BE(sub + 24 + g * 12) + codePoint - start
      }
    }
  }
  return 0
}

// The mono fallback faces are scaled to Martian Mono's metrics, so the swap from a fallback to the
// web font moves nothing (Lighthouse measured the bar's tools shifting before these faces existed).
// The web font's advance is the mean hmtx advance over the glyphs the bar sets; each fallback face's
// advance is its local font's advance width in its own units per em: Menlo and DejaVu Sans Mono
// 1233/2048 (Liberation Mono, in the same face, is 1229/2048), Consolas 1126/2048.
describe('mono fallback metrics', () => {
  const BAR_TEXT = 'KP Plan 1 Terrain 2 Console 3 Index 4 Range 5 Search Ctrl K Sources Theme: system light dark Keyboard shortcuts'
  const FALLBACKS = [
    { family: 'Martian Mono Fallback', advance: 1233 / 2048 },
    { family: 'Martian Mono Fallback Consolas', advance: 1126 / 2048 },
  ]
  const font = readFileSync(join(FONTS, 'martian-mono-latin-wght-normal.woff2'))
  const unitsPerEm = woff2Table(font, 'head').readUInt16BE(18)
  const hhea = woff2Table(font, 'hhea')
  const hmtx = woff2Table(font, 'hmtx')
  const cmap = woff2Table(font, 'cmap')
  const longMetrics = hhea.readUInt16BE(34)
  const advanceOf = (glyph: number) => hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4)
  const glyphs = [...new Set(BAR_TEXT)].map((char) => glyphId(cmap, char.codePointAt(0)!))
  const advance = glyphs.reduce((sum, glyph) => sum + advanceOf(glyph), 0) / glyphs.length / unitsPerEm
  const css = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8')
  const faceOf = (family: string) => new RegExp(`@font-face\\s*{[^}]*font-family:\\s*"${family}";[^}]*}`).exec(css)?.[0] ?? ''
  const percent = (face: string, name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)%`).exec(face)?.[1]) / 100

  it('maps every bar glyph in the web font', () => {
    expect(glyphs).not.toContain(0)
  })

  for (const fallback of FALLBACKS) {
    it(`scales ${fallback.family} to the web font advance and vertical metrics`, () => {
      const face = faceOf(fallback.family)
      expect(face).not.toBe('')
      const sizeAdjust = advance / fallback.advance
      expect(percent(face, 'size-adjust')).toBeCloseTo(sizeAdjust, 3)
      // size-adjust scales the overrides too, so each is divided by it.
      expect(percent(face, 'ascent-override')).toBeCloseTo(hhea.readInt16BE(4) / unitsPerEm / sizeAdjust, 3)
      expect(percent(face, 'descent-override')).toBeCloseTo(-hhea.readInt16BE(6) / unitsPerEm / sizeAdjust, 3)
      expect(percent(face, 'line-gap-override')).toBeCloseTo(hhea.readInt16BE(8) / unitsPerEm / sizeAdjust, 3)
    })
  }

  it('lists Menlo and DejaVu Sans Mono in one face and Consolas in its own', () => {
    expect(faceOf('Martian Mono Fallback')).toMatch(/local\("Menlo Regular"\)[\s\S]*local\("DejaVu Sans Mono"\)/)
    expect(faceOf('Martian Mono Fallback Consolas')).toMatch(/local\("Consolas"\)/)
  })

  it('sits right after the web font in the mono stack', () => {
    const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')
    expect(tokens).toMatch(/--mono:\s*"Martian Mono",\s*"Martian Mono Fallback",\s*"Martian Mono Fallback Consolas",/)
  })
})
