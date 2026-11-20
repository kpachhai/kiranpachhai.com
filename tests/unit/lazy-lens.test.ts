import { describe, expect, it } from 'vitest'
import { isLensModule } from '../../src/island/lenses/shared'
import * as terrain from '../../src/island/lenses/terrain'
import { chunkUrlFromPreloads, chunkUrlOf } from '../../src/island/stage'

const ORIGIN = 'https://kiranpachhai.com'

describe('chunkUrlOf', () => {
  it('keeps a same-origin chunk URL without its query', () => {
    const error = new TypeError(`Failed to fetch dynamically imported module: ${ORIGIN}/_astro/terrain.AbC.js?x=1`)
    expect(chunkUrlOf(error, ORIGIN)).toBe(`${ORIGIN}/_astro/terrain.AbC.js`)
  })

  it('also names a source module served by the dev server', () => {
    const error = new TypeError(`Failed to fetch dynamically imported module: ${ORIGIN}/src/island/lenses/terrain.ts?t=1`)
    expect(chunkUrlOf(error, ORIGIN)).toBe(`${ORIGIN}/src/island/lenses/terrain.ts`)
  })

  it('ignores another origin and messages with no URL', () => {
    expect(chunkUrlOf(new Error('Failed: https://elsewhere.test/a.js'), ORIGIN)).toBeUndefined()
    expect(chunkUrlOf(new Error('Importing a module script failed.'), ORIGIN)).toBeUndefined()
  })

  it('returns nothing, instead of throwing, for a match that is not a valid URL', () => {
    expect(() => chunkUrlOf(new Error('Failed: https://[broken.js'), ORIGIN)).not.toThrow()
    expect(chunkUrlOf(new Error('Failed: https://[broken.js'), ORIGIN)).toBeUndefined()
  })
})

describe('isLensModule', () => {
  it('accepts a lens module', () => {
    expect(isLensModule(terrain)).toBe(true)
  })

  it('rejects a chunk without the lens API', () => {
    expect(isLensModule({ default: () => {} })).toBe(false)
    expect(isLensModule({ layout() {}, height() {} })).toBe(false)
    expect(isLensModule(null)).toBe(false)
    expect(isLensModule(undefined)).toBe(false)
  })
})

describe('chunkUrlFromPreloads', () => {
  it('finds the lens chunk among the modulepreload links, same origin only', () => {
    const hrefs = [`${ORIGIN}/_astro/motion.Cp.js`, 'https://elsewhere.test/_astro/terrain.X.js', `${ORIGIN}/_astro/terrain.CDOPM67W.js`]
    expect(chunkUrlFromPreloads(hrefs, 'terrain', ORIGIN)).toBe(`${ORIGIN}/_astro/terrain.CDOPM67W.js`)
  })

  it('returns nothing when no link names the lens', () => {
    expect(chunkUrlFromPreloads([`${ORIGIN}/_astro/motion.Cp.js`, 'not a url::'], 'terrain', ORIGIN)).toBeUndefined()
  })
})
