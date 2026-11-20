import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// state.ts touches only a few browser globals; a small fake keeps this test in the node runner.
type FakeButton = { dataset: { lensButton: string }; attributes: Map<string, string>; setAttribute(name: string, value: string): void }

function fakeButton(lens: string): FakeButton {
  const attributes = new Map<string, string>()
  return { dataset: { lensButton: lens }, attributes, setAttribute: (name, value) => void attributes.set(name, value) }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

let buttons: FakeButton[]
let hashes: string[]

beforeEach(() => {
  vi.resetModules()
  buttons = ['plan', 'terrain', 'console', 'index', 'range'].map(fakeButton)
  hashes = []
  const location = { href: 'https://example.test/', hash: '' }
  vi.stubGlobal('window', {
    location,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: URL) => {
        hashes.push(url.hash)
        location.href = url.href
        location.hash = url.hash
      },
    },
  })
  vi.stubGlobal('document', { querySelectorAll: () => buttons })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const pressed = () => buttons.filter((button) => button.attributes.get('aria-pressed') === 'true').map((button) => button.dataset.lensButton)

describe('setLens with overlapping switches', () => {
  it('lets the newer switch win when an older leave resolves late', async () => {
    const state = await import('../../src/island/state')
    const stage = { dataset: {} as Record<string, string> } as unknown as HTMLElement
    const slowLeave = deferred()
    const calls: string[] = []
    state.registerLens('plan', {
      enter: () => void calls.push('enter plan'),
      leave: () => {
        calls.push('leave plan')
        return slowLeave.promise
      },
    })
    state.registerLens('terrain', { enter: () => void calls.push('enter terrain'), leave: () => void calls.push('leave terrain') })
    state.registerLens('console', { enter: () => void calls.push('enter console') })
    const notified: string[] = []
    state.onLensChange((id) => notified.push(id))

    await state.startLens(stage)
    notified.length = 0
    const first = state.setLens('terrain')
    const second = state.setLens('console')
    await second
    slowLeave.resolve()
    await first

    expect(stage.dataset.lens).toBe('console')
    expect(state.currentLens()).toBe('console')
    expect(pressed()).toEqual(['console'])
    expect(hashes).toEqual(['#lens-console'])
    expect(notified).toEqual(['console'])
    expect(calls).toEqual(['enter plan', 'leave plan', 'enter console'])
  })

  it('does not call leave on a lens whose enter never ran', async () => {
    const state = await import('../../src/island/state')
    const stage = { dataset: {} as Record<string, string> } as unknown as HTMLElement
    const leaves: string[] = []
    state.registerLens('terrain', { enter: () => {}, leave: () => void leaves.push('terrain') })
    await state.startLens(stage)
    const slow = deferred()
    state.registerLens('plan', { enter: () => {}, leave: () => slow.promise })
    await state.setLens('terrain')
    await state.setLens('index')
    expect(leaves).toEqual(['terrain'])
    expect(stage.dataset.lens).toBe('index')
  })
})
