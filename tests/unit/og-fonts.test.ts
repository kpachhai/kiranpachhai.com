import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ogFonts } from '../../src/og/render'

describe('social card fonts', () => {
  it('loads the three fonts once and hands back the same set on every call', () => {
    const first = ogFonts()
    expect(first.map((font) => font.name)).toEqual(['Bricolage Grotesque', 'Newsreader', 'Martian Mono'])
    expect(ogFonts()).toBe(first)
  })

  it('finds the fonts and renders a card when run from another working directory', () => {
    const render = join(process.cwd(), 'src', 'og', 'render.ts')
    const script = `const m = await import(${JSON.stringify(render)}); const png = await m.renderOg({ title: 'T', subtitle: 'S' }); console.log(png.length > 1000 ? 'ok' : 'small')`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: tmpdir(), encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('ok')
  })
})
