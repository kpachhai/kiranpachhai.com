import { expect, test, type Page } from '@playwright/test'

const LEGEND = 'Summits are areas of work. Trails are shared methods.'
const TERRAIN_CHUNK = /\/_astro\/terrain\.[^/]*\.js$/
const KEYS = { plan: '1', terrain: '2', console: '3', index: '4', range: '5' } as const
type Lens = keyof typeof KEYS

// The intro and the role cycle are not under test here; skip them so the page settles at once.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('kp-intro-seen', '1')
      window.sessionStorage.setItem('kp-roles-seen', '1')
    } catch {
      // Storage blocked: the intro plays, which these tests tolerate.
    }
  })
})

async function ready(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  await expect(page.locator('#stage')).toHaveAttribute('data-settled', /.+/)
}

async function switchTo(page: Page, lens: Lens) {
  await page.keyboard.press(KEYS[lens])
  await expect(page.locator('#stage')).toHaveAttribute('data-settled', lens, { timeout: 6000 })
}

const canvasCount = (page: Page) => page.evaluate(() => document.querySelectorAll('canvas').length)
const frames = (page: Page) => page.evaluate(() => Number(document.querySelector<HTMLCanvasElement>('#stage canvas')?.dataset.frames ?? -1))

// Resolves once the canvas has painted no frame for quietMs, with the frame count it stopped on;
// fails after limitMs. It waits on the paints themselves, so a slow runner only makes it later.
async function framesStopped(page: Page, quietMs = 500, limitMs = 5000): Promise<number> {
  return page.evaluate(
    ({ quietMs, limitMs }) =>
      new Promise<number>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')
        if (!canvas) return reject(new Error('no terrain canvas'))
        const count = () => Number(canvas.dataset.frames)
        let quiet = setTimeout(done, quietMs)
        const give = setTimeout(() => {
          observer.disconnect()
          clearTimeout(quiet)
          reject(new Error(`terrain still painting after ${limitMs} ms`))
        }, limitMs)
        const observer = new MutationObserver(() => {
          clearTimeout(quiet)
          quiet = setTimeout(done, quietMs)
        })
        observer.observe(canvas, { attributes: true, attributeFilter: ['data-frames'] })
        function done() {
          observer.disconnect()
          clearTimeout(give)
          resolve(count())
        }
      }),
    { quietMs, limitMs },
  )
}

// The drift rate measured in the page between paints: frames painted after the first observed
// paint, over the time they took. It waits for the paints, not for a fixed wall-clock window.
async function driftRate(page: Page, paints = 20): Promise<{ frames: number; fps: number }> {
  return page.evaluate(
    (paints) =>
      new Promise<{ frames: number; fps: number }>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')
        if (!canvas) return reject(new Error('no terrain canvas'))
        const times: number[] = []
        const give = setTimeout(() => {
          observer.disconnect()
          reject(new Error(`only ${times.length} paints in 10 s`))
        }, 10_000)
        const observer = new MutationObserver(() => {
          times.push(performance.now())
          if (times.length <= paints) return
          observer.disconnect()
          clearTimeout(give)
          resolve({ frames: paints, fps: (paints * 1000) / (times[paints] - times[0]) })
        })
        observer.observe(canvas, { attributes: true, attributeFilter: ['data-frames'] })
      }),
    paints,
  )
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

// WCAG relative luminance and contrast ratio for sRGB colours.
function luminance([r, g, b]: number[]): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test.describe('terrain code split', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the first load never requests the terrain chunk; pressing 2 requests it once', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await ready(page)
    await page.waitForLoadState('networkidle')
    expect(requests.filter((url) => TERRAIN_CHUNK.test(url))).toEqual([])
    await switchTo(page, 'terrain')
    expect(requests.filter((url) => TERRAIN_CHUNK.test(url))).toHaveLength(1)
    await switchTo(page, 'plan')
    await switchTo(page, 'terrain')
    expect(requests.filter((url) => TERRAIN_CHUNK.test(url))).toHaveLength(1)
  })

  test('loading /#lens-terrain starts in terrain', async ({ page }) => {
    await page.goto('/#lens-terrain')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'terrain', { timeout: 6000 })
    expect(await canvasCount(page)).toBe(1)
    await expect(page.locator('#stage')).not.toHaveAttribute('aria-busy', 'true')
  })
})

test.describe('terrain chunk failure', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a failed load reverts to the previous lens, says so once, and a later press of 2 retries', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (/uncaught|unhandled/i.test(message.text())) errors.push(message.text())
    })
    let attempts = 0
    await page.route(TERRAIN_CHUNK, (route) => {
      attempts++
      return route.abort()
    })
    await ready(page)
    await switchTo(page, 'console')
    await page.evaluate(() => {
      const live = document.getElementById('island-live')!
      const seen: string[] = []
      ;(window as unknown as { __live: string[] }).__live = seen
      new MutationObserver(() => seen.push(live.textContent ?? '')).observe(live, { childList: true, characterData: true, subtree: true })
    })
    await page.keyboard.press('2')
    await expect(page.locator('#island-live')).toHaveText('Terrain view could not load.')
    const stage = page.locator('#stage')
    await expect(stage).toHaveAttribute('data-settled', 'console')
    await expect(stage).toHaveAttribute('data-lens', 'console')
    await expect(stage).not.toHaveAttribute('aria-busy', /.*/)
    await expect(page.locator('[data-lens-button="console"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-lens-button="terrain"]')).toHaveAttribute('aria-pressed', 'false')
    expect(new URL(page.url()).hash).toBe('#lens-console')
    expect(await page.locator('#stage [data-deco]').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-deco')))).toEqual(['console'])
    expect(await canvasCount(page)).toBe(0)
    expect(attempts).toBe(1)
    const messages = await page.evaluate(() => (window as unknown as { __live: string[] }).__live)
    expect(messages.filter((text) => text === 'Terrain view could not load.')).toHaveLength(1)
    expect(errors).toEqual([])

    await page.unroute(TERRAIN_CHUNK)
    await switchTo(page, 'terrain')
    expect(await canvasCount(page)).toBe(1)
    await expect(page.locator('[data-lens-button="terrain"]')).toHaveAttribute('aria-pressed', 'true')
    expect(errors).toEqual([])
  })

  test('while the chunk loads, the stage keeps the look of the lens it shows', async ({ page }) => {
    await page.route(TERRAIN_CHUNK, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.continue()
    })
    await ready(page)
    await switchTo(page, 'console')
    await page.keyboard.press('2')
    const stage = page.locator('#stage')
    await expect(stage).toHaveAttribute('aria-busy', 'true')
    await expect(stage).toHaveAttribute('data-lens', 'console')
    await expect(page.locator('[data-lens-button="terrain"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(stage).toHaveAttribute('data-settled', 'terrain', { timeout: 8000 })
    await expect(stage).toHaveAttribute('data-lens', 'terrain')
    await expect(stage).not.toHaveAttribute('aria-busy', /.*/)
  })

  test('a first visit to /#lens-terrain with the chunk blocked settles on plan', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route(TERRAIN_CHUNK, (route) => route.abort())
    await page.goto('/#lens-terrain')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    const stage = page.locator('#stage')
    await expect(stage).toHaveAttribute('data-settled', 'plan')
    await expect(stage).toHaveAttribute('data-lens', 'plan')
    await expect(stage).not.toHaveAttribute('aria-busy', /.*/)
    await expect(page.locator('[data-lens-button="plan"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#island-live')).toHaveText('Terrain view could not load.')
    expect(new URL(page.url()).hash).toBe('#lens-plan')
    expect(await canvasCount(page)).toBe(0)
    expect(errors).toEqual([])
  })

  test('a retry that loads a chunk without the lens API reverts cleanly, and a later retry works', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let mode: 'abort' | 'not-a-lens' | 'real' = 'abort'
    await page.route(
      (url) => /\/_astro\/terrain\.[^/]*\.js$/.test(url.pathname),
      (route) => {
        if (mode === 'abort') return route.abort()
        if (mode === 'not-a-lens') return route.fulfill({ contentType: 'text/javascript', body: 'export const nothing = 1\n' })
        return route.continue()
      },
    )
    await ready(page)
    await page.keyboard.press('2')
    await expect(page.locator('#island-live')).toHaveText('Terrain view could not load.')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')

    mode = 'not-a-lens'
    await page.evaluate(() => (document.getElementById('island-live')!.textContent = ''))
    await page.keyboard.press('2')
    await expect(page.locator('#island-live')).toHaveText('Terrain view could not load.')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
    await expect(page.locator('#stage')).not.toHaveAttribute('aria-busy', /.*/)

    mode = 'real'
    await switchTo(page, 'terrain')
    expect(await canvasCount(page)).toBe(1)
    expect(errors).toEqual([])
  })

  // A render may draw twice when its legend grows the stage, so a single press is the baseline.
  // Both terrain enters are pending on the same 1.5 s load; only the newer one may render.
  async function canvasesDrawn(page: Page, keys: string[]): Promise<number> {
    await page.route(TERRAIN_CHUNK, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await ready(page)
    await page.evaluate(() => {
      const record = { canvases: 0 }
      ;(window as unknown as { __record: typeof record }).__record = record
      new MutationObserver((changes) => {
        for (const change of changes) for (const node of change.addedNodes) if (node instanceof HTMLCanvasElement) record.canvases++
      }).observe(document.querySelector('#stage .stage-box')!, { childList: true })
    })
    // Each press waits only until its edge fade is over and its enter has begun: a terrain enter
    // starts its load (the stage is busy), any other lens takes data-lens. That keeps every
    // terrain enter pending on the slow load, however slow the runner is.
    const stage = page.locator('#stage')
    for (const key of keys) {
      await page.keyboard.press(key)
      const lens = (Object.keys(KEYS) as Lens[]).find((name) => KEYS[name] === key)!
      if (lens === 'terrain') await expect(stage).toHaveAttribute('aria-busy', 'true')
      else await expect(stage).toHaveAttribute('data-lens', lens)
    }
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'terrain', { timeout: 6000 })
    await page.waitForTimeout(300)
    expect(await canvasCount(page)).toBe(1)
    await page.unroute(TERRAIN_CHUNK)
    return page.evaluate(() => (window as unknown as { __record: { canvases: number } }).__record.canvases)
  }

  test('2, 3, 2 while the chunk loads renders terrain once', async ({ page }) => {
    const single = await canvasesDrawn(page, ['2'])
    await page.goto('about:blank')
    expect(await canvasesDrawn(page, ['2', '3', '2'])).toBe(single)
  })
})

test.describe('one canvas at most', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('every lens has at most one canvas, terrain exactly one, and leaving terrain releases it', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => {
      const w = window as unknown as { __maxCanvas: number }
      w.__maxCanvas = 0
      const sample = () => {
        w.__maxCanvas = Math.max(w.__maxCanvas, document.querySelectorAll('canvas').length)
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    for (const lens of ['terrain', 'console', 'terrain', 'index', 'range', 'terrain', 'plan'] as Lens[]) {
      await switchTo(page, lens)
      expect(await canvasCount(page), lens).toBe(lens === 'terrain' ? 1 : 0)
    }
    // rapid switches through terrain, including terrain to plan and back inside the fade
    await switchTo(page, 'terrain')
    await page.evaluate(() => (window as unknown as { __old: HTMLCanvasElement }).__old = document.querySelector('#stage canvas')!)
    for (const key of ['1', '2', '3', '2', '1', '2', '4']) await page.keyboard.press(key)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'index', { timeout: 6000 })
    expect(await canvasCount(page)).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __maxCanvas: number }).__maxCanvas)).toBe(1)
    // the released canvas keeps no backing store and draws no more frames
    const released = await page.evaluate(() => {
      const old = (window as unknown as { __old: HTMLCanvasElement }).__old
      return { connected: old.isConnected, width: old.width, height: old.height, frames: Number(old.dataset.frames) }
    })
    expect(released).toMatchObject({ connected: false, width: 0, height: 0 })
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => Number((window as unknown as { __old: HTMLCanvasElement }).__old.dataset.frames))).toBe(released.frames)
  })
})

test.describe('terrain frame cost at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // Times every animation-frame callback on the main thread (the terrain paint runs inside one)
  // and records when the canvas paints, for one Terrain session: the ripple, then 3 s of drift.
  test('paints at most 15 frames a second through the ripple and drift; records main-thread time per frame', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const record = { callbacks: [] as number[], paintCosts: [] as number[], paints: [] as number[] }
      ;(window as unknown as { __cost: typeof record }).__cost = record
      const native = window.requestAnimationFrame.bind(window)
      const painted = () => document.querySelector<HTMLCanvasElement>('#stage canvas')?.dataset.frames
      window.requestAnimationFrame = (callback) =>
        native((time) => {
          const before = painted()
          const start = performance.now()
          callback(time)
          const cost = performance.now() - start
          if (!document.querySelector('#stage canvas')) return
          record.callbacks.push(cost)
          if (painted() !== before) record.paintCosts.push(cost)
        })
    })
    await ready(page)
    await page.evaluate(() => {
      const record = (window as unknown as { __cost: { callbacks: number[]; paintCosts: number[]; paints: number[] } }).__cost
      record.callbacks.length = 0
      record.paintCosts.length = 0
      new MutationObserver((changes) => {
        for (const change of changes) {
          if (change.target instanceof HTMLCanvasElement && change.attributeName === 'data-frames') record.paints.push(performance.now())
        }
      }).observe(document.querySelector('#stage .stage-box')!, { attributes: true, subtree: true, attributeFilter: ['data-frames'] })
    })
    await switchTo(page, 'terrain')
    await page.waitForTimeout(3000)
    type Cost = { callbacks: number[]; paintCosts: number[]; paints: number[] }
    const { callbacks, paintCosts, paints } = await page.evaluate(() => (window as unknown as { __cost: Cost }).__cost)

    // Over any one-second window, no more than 15 paints plus the window's edge frame.
    for (let i = 0; i < paints.length; i++) {
      const inWindow = paints.filter((time) => time >= paints[i] && time < paints[i] + 1000).length
      expect(inWindow, `paints in the second from ${Math.round(paints[i])} ms`).toBeLessThanOrEqual(16)
    }
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b)
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
      const round = (value: number) => Number(value.toFixed(2))
      return {
        count: sorted.length,
        meanMs: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
        p50Ms: round(at(0.5)),
        p95Ms: round(at(0.95)),
        maxMs: round(sorted[sorted.length - 1]),
      }
    }
    const timing = { viewport: '390x844', everyFrame: summary(callbacks), paintedFrames: summary(paintCosts) }
    await testInfo.attach('terrain-frame-timing', { body: JSON.stringify(timing), contentType: 'application/json' })
    console.log(`terrain-frame-timing ${testInfo.project.name} ${JSON.stringify(timing)}`)
    expect(timing.paintedFrames.count).toBeGreaterThan(10)
    // Budget, not wall clock: at 15 fps a painted frame has 66.7 ms before the next one is due, so a
    // paint that took longer would drop the drift below its rate. The measured times are attached.
    expect(timing.paintedFrames.p95Ms).toBeLessThan(1000 / 15)
  })
})

test.describe('terrain drift', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('idles at no more than 15 fps and stops while the tab is hidden', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'terrain')
    await expect.poll(() => frames(page)).toBeGreaterThan(0)
    // At most 15 paints a second, with a little room for timer jitter between two paints.
    const { fps } = await driftRate(page)
    expect(fps).toBeGreaterThan(0)
    expect(fps).toBeLessThanOrEqual(15.5)

    await setHidden(page, true)
    const hiddenAt = await framesStopped(page)
    expect(await frames(page)).toBe(hiddenAt)

    await setHidden(page, false)
    await expect.poll(() => frames(page)).toBeGreaterThan(hiddenAt)
  })

  test('stops while the stage is scrolled out of view', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'terrain')
    await expect.poll(() => frames(page)).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const away = await framesStopped(page)
    expect(await frames(page)).toBe(away)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => frames(page)).toBeGreaterThan(away)
  })

  test('with reduced motion it shows a still frame and never drifts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    await switchTo(page, 'terrain')
    await expect.poll(() => frames(page)).toBeGreaterThan(0)
    const still = await framesStopped(page, 600)
    expect(await frames(page)).toBe(still)
    const inked = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')!
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let k = 3; k < pixels.length; k += 4) if (pixels[k] > 0) count++
      return count
    })
    expect(inked).toBeGreaterThan(1000)
  })

  test('turning reduced motion on while drifting stops the drift', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'terrain')
    await expect.poll(() => frames(page)).toBeGreaterThan(3)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const still = await framesStopped(page)
    expect(await frames(page)).toBe(still)
  })
})

test.describe('terrain canvas resolution', () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 })

  test('caps the device pixel ratio at 2', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'terrain')
    const size = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')!
      const rect = canvas.getBoundingClientRect()
      return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height }
    })
    expect(size.width).toBe(Math.round(size.cssWidth * 2))
    expect(size.height).toBe(Math.round(size.cssHeight * 2))
  })
})

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`terrain at ${viewport.width} px, ${colorScheme}`, () => {
      test.use({ viewport, colorScheme })

      test('legend, labels inside bounds, no horizontal scroll, label halo keeps 4.5:1', async ({ page }) => {
        await ready(page)
        await switchTo(page, 'terrain')
        await expect(page.locator('#stage .ter-legend .lt')).toHaveText(LEGEND)
        const stageText = (await page.locator('#stage').innerText()).toLowerCase()
        for (const word of ['illustrative', 'not a measure', 'on purpose']) expect(stageText).not.toContain(word)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)

        const bounds = await page.evaluate(() => {
          const canvas = document.querySelector('#stage canvas')!.getBoundingClientRect()
          const box = document.querySelector('#stage .stage-box')!.getBoundingClientRect()
          const titles = [...document.querySelectorAll('#stage .n-title')].map((title) => title.getBoundingClientRect())
          return { canvas: { x: canvas.left, y: canvas.top, w: canvas.width, h: canvas.height }, box: { x: box.left, w: box.width }, titles: titles.map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })) }
        })
        if (viewport.width < 720) expect(bounds.canvas.h).toBeGreaterThan(bounds.canvas.w)
        for (const title of bounds.titles) {
          expect(title.l).toBeGreaterThanOrEqual(bounds.canvas.x)
          expect(title.r).toBeLessThanOrEqual(bounds.canvas.x + bounds.canvas.w)
          expect(title.t).toBeGreaterThanOrEqual(bounds.canvas.y)
          expect(title.b).toBeLessThanOrEqual(bounds.canvas.y + bounds.canvas.h)
        }

        // Measure the halo: hide the glyphs, screenshot each label box, and take the worst pixel under it
        // against both the resting ink and the selected summit colour.
        const inks = await page.evaluate(() => {
          const rgb = (value: string) => (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
          const title = document.querySelector<HTMLElement>('#stage .n-title')!
          const probe = document.createElement('span')
          probe.style.color = 'var(--summit)'
          document.body.append(probe)
          const summit = rgb(getComputedStyle(probe).color)
          probe.remove()
          return { ink: rgb(getComputedStyle(title).color), summit }
        })
        await page.evaluate(() => {
          for (const title of document.querySelectorAll<HTMLElement>('#stage .n-title')) title.style.color = 'transparent'
        })
        let worst = Infinity
        const titles = page.locator('#stage .n-title')
        for (let index = 0; index < (await titles.count()); index++) {
          const shot = await titles.nth(index).screenshot()
          const pixels = await page.evaluate(async (base64) => {
            const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
            const bitmap = await createImageBitmap(blob)
            const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
            const context = surface.getContext('2d')!
            context.drawImage(bitmap, 0, 0)
            const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
            const colours = new Set<string>()
            for (let k = 0; k < data.length; k += 4) colours.add(`${data[k]},${data[k + 1]},${data[k + 2]}`)
            return [...colours]
          }, shot.toString('base64'))
          for (const pixel of pixels) {
            const colour = pixel.split(',').map(Number)
            worst = Math.min(worst, contrast(inks.ink, colour), contrast(inks.summit, colour))
          }
        }
        await page.evaluate(() => {
          for (const title of document.querySelectorAll<HTMLElement>('#stage .n-title')) title.style.color = ''
        })
        console.log(`terrain ${viewport.width} ${colorScheme}: worst label contrast ${worst.toFixed(2)}`)
        expect(worst).toBeGreaterThanOrEqual(4.5)
      })
    })
  }
}
