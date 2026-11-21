import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The five lenses and their single-key shortcuts are gone, so none of their names belong in the
// source or the built pages. dist/ is built once by tests/unit/build-once.ts.
const root = process.cwd()

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

const REMOVED = ['data-lens', 'kp-lens', 'kp-shortcuts']

describe('no lens leftovers', () => {
  it('no file under src mentions data-lens, kp-lens or kp-shortcuts', () => {
    const hits = listFiles(join(root, 'src')).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return REMOVED.filter((name) => text.includes(name)).map((name) => `${file}: ${name}`)
    })
    expect(hits).toEqual([])
  })

  it('the built site has no shortcuts control and no data-lens attribute', () => {
    const pages = listFiles(join(root, 'dist')).filter((file) => file.endsWith('.html'))
    expect(pages.length).toBeGreaterThan(1)
    const hits = pages.flatMap((file) => {
      const html = readFileSync(file, 'utf8')
      return ['data-shortcuts-control', 'data-lens', 'kp-shortcuts'].filter((name) => html.includes(name)).map((name) => `${file}: ${name}`)
    })
    expect(hits).toEqual([])
  })
})
