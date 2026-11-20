import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

const LENSES = ['plan', 'terrain', 'console', 'index', 'range'] as const
type Lens = (typeof LENSES)[number]
const KEY: Record<Lens, string> = { plan: '1', terrain: '2', console: '3', index: '4', range: '5' }
const DRAWN: Lens[] = ['plan', 'console', 'index', 'range']

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
  await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
}

async function switchTo(page: Page, lens: Lens) {
  await page.keyboard.press(KEY[lens])
  await expect(page.locator('#stage')).toHaveAttribute('data-settled', lens, { timeout: 5000 })
}

// Animations the lens code owns. The console caret is the one CSS loop by design, so CSS animations are left out here.
const scriptedAnimations = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation)).length)

const nodeRects = (page: Page) =>
  page.evaluate(() => {
    const origin = document.querySelector('#stage .stage-box')!.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>('#stage .node-box')].map((box) => {
      const rect = box.getBoundingClientRect()
      return { id: box.dataset.domain, x: Math.round(rect.left - origin.left), y: Math.round(rect.top - origin.top), w: Math.round(rect.width), h: Math.round(rect.height), left: parseFloat(box.style.left), top: parseFloat(box.style.top) }
    })
  })

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`settled lenses at ${viewport.width} px, ${colorScheme}`, () => {
      test.use({ viewport, colorScheme })

      test('every lens settles with no horizontal scroll and nodes at their layout rects', async ({ page }) => {
        await ready(page)
        for (const lens of [...LENSES.slice(1), 'plan'] as Lens[]) {
          await switchTo(page, lens)
          expect(await page.evaluate(() => document.documentElement.scrollWidth), lens).toBe(viewport.width)
          for (const rect of await nodeRects(page)) {
            expect(Math.abs(rect.x - rect.left), `${lens} ${rect.id} x`).toBeLessThanOrEqual(1)
            expect(Math.abs(rect.y - rect.top), `${lens} ${rect.id} y`).toBeLessThanOrEqual(1)
          }
          expect(await scriptedAnimations(page), lens).toBe(0)
        }
      })
    })
  }
}

test.describe('larger text at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('with the root font at 200% the bar keeps every label inside its control, with no overlap', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    const report = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLElement>('header.bar button')].filter((control) => control.getClientRects().length > 0)
      const squeezed = controls.filter((control) => control.scrollWidth > control.clientWidth + 1).map((control) => control.textContent?.trim())
      const rects = controls.map((control) => ({ name: control.textContent?.trim(), rect: control.getBoundingClientRect() }))
      const overlaps: string[] = []
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].rect
          const b = rects[j].rect
          if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) overlaps.push(`${rects[i].name} / ${rects[j].name}`)
        }
      }
      return { squeezed, overlaps, count: controls.length, scroll: document.documentElement.scrollWidth }
    })
    expect(report.count).toBeGreaterThan(6)
    expect(report.squeezed).toEqual([])
    expect(report.overlaps).toEqual([])
    expect(report.scroll).toBe(390)
  })

  // Words of up to ten letters fit the label column at 200%; longer ones may hyphenate.
  test('with the root font at 200% no short word in an upstream label breaks', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    const broken = await page.locator('#upstream .ledger td a').evaluateAll((links) =>
      links.flatMap((link) => {
        // A word split across lines shows up as one text node with more line boxes than its words allow.
        const range = document.createRange()
        const words = (link.textContent ?? '').split(/[\s-]+/).filter((word) => word.length > 0 && word.length <= 10)
        const split: string[] = []
        for (const word of words) {
          const text = link.firstChild
          if (!text) continue
          const start = (link.textContent ?? '').indexOf(word)
          range.setStart(text, start)
          range.setEnd(text, start + word.length)
          const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
          if (tops.size > 1) split.push(word)
        }
        return split
      }),
    )
    expect(broken).toEqual([])
  })

  test('with the root font at 200% no node label overflows and nodes do not overlap', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    for (const lens of LENSES) {
      await switchTo(page, lens)
      const before = await page.locator('#stage .stage-box').evaluate((box) => box.getBoundingClientRect().height)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      await expect.poll(() => page.locator('#stage .stage-box').evaluate((box) => box.getBoundingClientRect().height), lens).toBeGreaterThan(before)
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#stage .n-title, #stage .node')]
          .filter((label) => label.scrollWidth > label.clientWidth)
          .map((label) => label.textContent),
      )
      expect(overflow, lens).toEqual([])
      const rects = await nodeRects(page)
      for (let first = 0; first < rects.length; first++) {
        for (let second = first + 1; second < rects.length; second++) {
          const a = rects[first]
          const b = rects[second]
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          expect(hit, `${lens} ${a.id} / ${b.id}`).toBe(false)
        }
      }
      // No section of the page scrolls sideways at this size.
      expect(await page.evaluate(() => document.documentElement.scrollWidth), lens).toBe(390)
      // The stage's own content stays inside it.
      const outside = await page.evaluate(() => {
        const box = document.querySelector('#stage .stage-box')!.getBoundingClientRect()
        // The proof lists are visually hidden on purpose (clipped to 1px), so they are skipped.
        return [...document.querySelectorAll('#stage .stage-box *')]
          .filter((item) => !item.closest('.proofs'))
          .filter((item) => {
            const rect = item.getBoundingClientRect()
            return rect.width > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1)
          })
          .map((item) => `${item.tagName} ${item.getAttribute('class') ?? ''} ${item.textContent?.slice(0, 30)}`)
      })
      expect(outside, lens).toEqual([])
      await page.evaluate(() => {
        document.documentElement.style.fontSize = ''
      })
      await expect.poll(() => page.locator('#stage .stage-box').evaluate((box) => box.getBoundingClientRect().height)).toBe(before)
    }
  })
})

test.describe('reduced motion', () => {
  test('a lens switch is instant and leaves no animation running', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    for (const lens of [...LENSES.slice(1), 'plan'] as Lens[]) {
      await page.keyboard.press(KEY[lens])
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', lens)
      expect(await page.evaluate(() => document.getAnimations().length), lens).toBe(0)
    }
  })

  test('turning reduced motion on mid-morph finishes the morph at once', async ({ page }) => {
    await ready(page)
    await page.keyboard.press('3')
    // Mid-morph: the fade is over and the node boxes are moving.
    await page.waitForFunction(() => [...document.querySelectorAll('#stage .node-box')].some((box) => box.getAnimations().length > 0))
    expect(await scriptedAnimations(page)).toBeGreaterThan(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // The move just started, so at least 800 ms of it remain: ending within 400 ms means it was cut short.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 400 }).toBe(0)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'console')
    for (const rect of await nodeRects(page)) expect(Math.abs(rect.y - rect.top), rect.id).toBeLessThanOrEqual(1)
  })
})

test.describe('reduced motion inside the edge fade', () => {
  test('turning reduced motion on during the 180 ms fade stops the morph that follows', async ({ page }) => {
    await ready(page)
    // Start the switch and hold the edge fade in the same task, so the toggle lands inside the fade
    // however slow the runner is. Reduced motion then has to finish the held fade and skip the morph.
    const held = await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))
      const fades = document.querySelector('#stage [data-deco]')!.getAnimations()
      for (const fade of fades) fade.pause()
      return fades.length
    })
    expect(held).toBe(1)
    expect(await page.locator('#stage').getAttribute('data-lens'), 'still in the fade').toBe('plan')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'console')
    // Nothing starts late either: still zero a full morph later.
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    for (const rect of await nodeRects(page)) {
      expect(Math.abs(rect.x - rect.left), rect.id).toBeLessThanOrEqual(1)
      expect(Math.abs(rect.y - rect.top), rect.id).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('morph', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('leaving during the draw-in holds each half-drawn line where it is while it fades', async ({ page }) => {
    await ready(page)
    await page.keyboard.press('3')
    // Wait until some console connector is part-way through its draw-in.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#stage [data-deco] path, #stage [data-deco] line, #stage [data-deco] polyline')].some((line) =>
          line.getAnimations().some((animation) => {
            const progress = animation.effect?.getComputedTiming().progress
            return animation.playState === 'running' && progress !== null && progress !== undefined && progress > 0.15 && progress < 0.85
          }),
        ),
      undefined,
      { polling: 'raf', timeout: 5000 },
    )
    // A cancelled draw-in would jump to the full stroke (offset 0) for the fade; a held one keeps its
    // offset. Pausing settles within a frame, so the offset is compared between later frames.
    const offsets = await page.evaluate(
      () =>
        new Promise<{ held: number; later: number }[]>((resolve) => {
          const lines = [...document.querySelectorAll<SVGGeometryElement>('#stage [data-deco] path, #stage [data-deco] line, #stage [data-deco] polyline')].filter((line) =>
            line.getAnimations().some((animation) => {
              const progress = animation.effect?.getComputedTiming().progress
              return animation.playState === 'running' && progress !== null && progress !== undefined && progress > 0.05 && progress < 0.85
            }),
          )
          const read = () => lines.map((line) => parseFloat(getComputedStyle(line).strokeDashoffset))
          const frames = (count: number, then: () => void) => (count === 0 ? then() : requestAnimationFrame(() => frames(count - 1, then)))
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '4', code: 'Digit4', bubbles: true }))
          frames(2, () => {
            const held = read()
            frames(4, () => resolve(read().map((later, k) => ({ held: held[k], later }))))
          })
        }),
    )
    expect(offsets.length).toBeGreaterThan(0)
    for (const { held, later } of offsets) {
      expect(held).toBeGreaterThan(1)
      expect(Math.abs(later - held)).toBeLessThan(0.5)
    }
  })

  test('A to B and back to A inside the fade redraws A at once, since no node moves', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'console')
    const started = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Digit${key}`, bubbles: true }))
          press('4')
          setTimeout(() => {
            press('3')
            // 300 ms later the console connectors are drawing; with the full morph delay they would still wait.
            setTimeout(() => {
              const group = document.querySelector('#stage [data-deco="console"]')
              const drawing = group ? group.getAnimations({ subtree: true }).some((animation) => (animation.effect?.getComputedTiming().progress ?? 0) > 0) : false
              resolve(drawing)
            }, 300)
          }, 60)
        }),
    )
    expect(started).toBe(true)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'console')
  })

  test('decorations fade out in 180 ms, then nodes move 800 ms ease-out-quint with a 50 ms stagger', async ({ page }) => {
    await ready(page)
    const fade = await page.evaluate(() => {
      const keys = new KeyboardEvent('keydown', { key: '4', bubbles: true })
      document.dispatchEvent(keys)
      const group = document.querySelector('#stage [data-deco]')!
      return group.getAnimations().map((animation) => animation.effect!.getTiming().duration)
    })
    expect(fade).toEqual([180])
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('#stage .node-box')[0].getAnimations().length), { timeout: 1000, intervals: [10] })
      .toBe(1)
    const timings = await page.evaluate(() =>
      [...document.querySelectorAll('#stage .node-box')].map((box) => {
        const timing = box.getAnimations()[0]?.effect?.getTiming()
        return timing && { duration: timing.duration, delay: timing.delay, easing: timing.easing }
      }),
    )
    expect(timings).toEqual([0, 50, 100, 150, 200, 250].map((delay) => ({ duration: 800, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })))
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'index')
  })

  test('rapid switches never show two lenses decorations and settle on the last lens', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await ready(page)
    await page.evaluate(() => {
      const record = { max: 0, wrong: 0 }
      ;(window as unknown as { decoRecord: typeof record }).decoRecord = record
      const sample = () => {
        const groups = document.querySelectorAll('#stage [data-deco]')
        record.max = Math.max(record.max, groups.length)
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    // A to B to A inside the fade-out, then again inside the morph, then a burst across every lens.
    await page.keyboard.press('3')
    await page.waitForTimeout(60)
    await page.keyboard.press('1')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
    await page.keyboard.press('4')
    await page.waitForTimeout(450)
    await page.keyboard.press('1')
    await page.waitForTimeout(120)
    for (const key of ['5', '3', '2', '4', '5']) {
      await page.keyboard.press(key)
      await page.waitForTimeout(40)
    }
    await page.keyboard.press('1')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
    const record = await page.evaluate(() => (window as unknown as { decoRecord: { max: number } }).decoRecord)
    expect(record.max).toBeLessThanOrEqual(1)
    expect(await page.locator('#stage [data-deco]').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-deco')))).toEqual(['plan'])
    expect(await scriptedAnimations(page)).toBe(0)
    for (const rect of await nodeRects(page)) {
      expect(Math.abs(rect.x - rect.left), rect.id).toBeLessThanOrEqual(1)
      expect(Math.abs(rect.y - rect.top), rect.id).toBeLessThanOrEqual(1)
    }
    const opacity = await page.locator('#stage [data-deco]').evaluate((group) => getComputedStyle(group).opacity)
    expect(opacity).toBe('1')
    expect(errors).toEqual([])
  })
})

test.describe('lens content', () => {
  test('the stage keeps one accessible list of the six domains', async ({ page }) => {
    await ready(page)
    for (const lens of DRAWN) {
      await switchTo(page, lens)
      await expect(page.locator('#stage [data-node]')).toHaveCount(6)
      await expect(page.locator('#stage .deco')).toHaveAttribute('aria-hidden', 'true')
      for (const domain of model.domains) await expect(page.getByRole('button', { name: domain.name, exact: true }), lens).toHaveCount(1)
      const listText = await page.locator('#stage ol.index').textContent()
      for (const proof of model.proofs) expect(listText, proof.id).toContain(proof.label)
      // Invisible links stay out of the Tab order; the drawer offers the same links visibly.
      expect(await page.locator('#stage .proofs a:not([tabindex="-1"])').count(), lens).toBe(0)
    }
  })

  test('console prints the capability tree and the method gates with drawn pass marks', async ({ page }) => {
    await ready(page)
    await switchTo(page, 'console')
    const deco = page.locator('#stage [data-deco="console"]')
    await expect(deco).toContainText('kp map --capabilities')
    await expect(deco).toContainText('kp gates --methods')
    await expect(deco.locator('.gate-row')).toHaveCount(5)
    await expect(deco.locator('.gate-row svg.pass-mark')).toHaveCount(5)
    for (const method of model.methods) await expect(deco.locator(`.gate-row[data-m="${method.id}"] .gn`)).toHaveText(`${method.id} ${method.name}`)
    expect(await page.locator('#stage').textContent()).not.toContain('✓')
    // One tree bar plus one stub per node, all in the SVG gutter.
    await expect(deco.locator('path.ln-thin')).toHaveCount(7)
  })

  test('plan shows the five methods in its revision table and no HIP number', async ({ page }) => {
    await ready(page)
    const rows = page.locator('#stage [data-deco="plan"] .rev tbody tr')
    await expect(rows).toHaveCount(5)
    expect(await rows.locator('b').allTextContents()).toEqual(model.methods.map((method) => method.name))
    expect(await page.locator('#stage').textContent()).not.toMatch(/HIP-?\d/)
  })

  test('range fills only the cells model.range lists and a cell opens its row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    await switchTo(page, 'range')
    const filled = await page.locator('#stage [data-cell]').evaluateAll((items) => items.map((item) => item.getAttribute('data-cell')).sort())
    expect(filled).toEqual(model.range.map((cell) => `${cell.domainId}/${cell.mode}`).sort())
    const first = model.range[0]
    await page.locator(`#stage [data-cell="${first.domainId}/${first.mode}"]`).click()
    await expect(page.locator('#drawer h2')).toHaveText(model.domains.find((domain) => domain.id === first.domainId)!.name)
  })

  test('a node opens the drawer in every lens', async ({ page }) => {
    await ready(page)
    const domain = model.domains[2]
    for (const lens of LENSES) {
      await switchTo(page, lens)
      await page.locator(`#stage [data-node="${domain.id}"]`).click()
      await expect(page.locator('#drawer h2'), lens).toHaveText(domain.name)
      await page.keyboard.press('Escape')
      await expect(page.locator('#drawer')).toBeHidden()
    }
  })
})
