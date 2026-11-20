import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const dist = join(process.cwd(), 'dist')

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

describe('astro build', () => {
  beforeAll(() => {
    execSync('npm run build', { stdio: 'pipe' })
  }, 120_000)

  it('keeps the CNAME file byte for byte', () => {
    expect(readFileSync(join(dist, 'CNAME'), 'utf8')).toBe('kiranpachhai.com\n')
  })

  it('renders an English document', () => {
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('<html lang="en">')
  })

  it('contains nothing from the old CRA build', () => {
    expect(existsSync(join(dist, 'asset-manifest.json'))).toBe(false)
    expect(existsSync(join(dist, 'static', 'js'))).toBe(false)
    const leftovers = listFiles(dist).filter((file) => /asset-manifest|[\\/]static[\\/]js[\\/]/.test(file))
    expect(leftovers).toEqual([])
  })
})
