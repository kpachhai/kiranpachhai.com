import { describe, expect, it } from 'vitest'
import { DEFAULT_E2E_PORT, e2ePort } from '../e2e/port'

describe('e2ePort', () => {
  it('uses the default quietly when E2E_PORT is unset', () => {
    const warnings: string[] = []
    expect(e2ePort(undefined, (message) => warnings.push(message))).toBe(DEFAULT_E2E_PORT)
    expect(warnings).toEqual([])
  })

  it('accepts a numeric port', () => {
    expect(e2ePort('4400', () => {})).toBe(4400)
    expect(e2ePort(' 5000 ', () => {})).toBe(5000)
  })

  it.each(['', '   ', 'abc', '43x', '-1', '0', '70000', '4.5'])('falls back to the default with a warning for %j', (raw) => {
    const warnings: string[] = []
    expect(e2ePort(raw, (message) => warnings.push(message))).toBe(DEFAULT_E2E_PORT)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(String(DEFAULT_E2E_PORT))
  })
})
