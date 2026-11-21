import { expect, test, type Page } from '@playwright/test'
import { cycleTitles, model } from '../../src/model'

// The sheet's intro, the hero's role cycle beside it, and the hero's independence from late web
// fonts, and the static content shown with reduced motion or without JavaScript. Every test starts
// in a fresh browser context, so sessionStorage is empty and a first visit plays the intro unless a
// test sets the key or reduced motion is on.
const INTRO_KEY = 'kp-intro-seen'
const PHASES = ['frame', 'contours', 'summits', 'trails', 'schedule', 'materials'] as const

async function loaded(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  return page.evaluate(() => performance.now())
}

// The intro's own animations; the command line's blinking caret is a CSS animation and is left out.
const scripted = (page: Page) => page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation)).length)

// One reading of everything the intro may leave behind on the sheet.
const sheetState = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.getElementById('sheet')!
    const inside = [...sheet.querySelectorAll<Element>('[data-phase], [data-phase] *')]
    const style = (element: Element) => getComputedStyle(element)
    return {
      intro: sheet.dataset.intro ?? null,
      animations: sheet.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation)).length,
      faded: inside.filter((element) => Number(style(element).opacity) < 1 && !element.matches('.contour:not(.index)')).length,
      // A summit is centred on its point by its own translate; SVG children carry their placement.
      moved: inside.filter((element) => style(element).transform !== 'none' && !element.matches('svg *, a.summit')).length,
      dashed: [...sheet.querySelectorAll('path.contour')].filter((path) => style(path).strokeDasharray !== 'none').length,
      skipShown: style(document.getElementById('intro-skip')!).visibility === 'visible' && !(document.getElementById('intro-skip') as HTMLButtonElement).hidden,
    }
  })

function expectSettled(state: Awaited<ReturnType<typeof sheetState>>, label: string) {
  expect(state.intro, `${label}: intro marker`).toBeNull()
  expect(state.animations, `${label}: animations on the sheet`).toBe(0)
  expect(state.faded, `${label}: faded elements`).toBe(0)
  expect(state.moved, `${label}: moved elements`).toBe(0)
  expect(state.dashed, `${label}: half-drawn contours`).toBe(0)
  expect(state.skipShown, `${label}: skip control`).toBe(false)
}

test.describe('sheet intro', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the intro plays once per session and then stays settled', async ({ page }) => {
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    expect(await scripted(page)).toBeGreaterThan(0)
    await expect(page.locator('#intro-skip')).toBeVisible()
    expect(await page.evaluate((key) => sessionStorage.getItem(key), INTRO_KEY)).toBe('1')
    await expect(page.locator('#sheet')).not.toHaveAttribute('data-intro', 'play', { timeout: 4000 })
    expectSettled(await sheetState(page), 'after the intro')

    await loaded(page)
    await page.waitForTimeout(400)
    expectSettled(await sheetState(page), 'second load')
    expect(await scripted(page)).toBe(0)
  })

  for (const width of [390, 1280]) {
    test(`the settled sheet is painted before the intro starts, and layout shift during the intro stays under 0.02 at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.addInitScript(() => {
        const log = { firstFrame: null as null | { animations: number; contoursShown: number }, introAt: Infinity, shift: 0 }
        ;(window as unknown as { introLog: typeof log }).introLog = log
        const look = () => {
          const sheet = document.getElementById('sheet')
          if (!sheet) {
            requestAnimationFrame(look)
            return
          }
          const contours = [...sheet.querySelectorAll('path.contour')]
          // The sheet's own scripted animations: the hero's role cycle beside it may already be
          // stepping in this frame, and it is not the intro.
          log.firstFrame = {
            animations: sheet.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation)).length,
            contoursShown: contours.filter((path) => getComputedStyle(path).strokeDasharray === 'none').length,
          }
        }
        requestAnimationFrame(look)
        new MutationObserver(() => {
          if (document.getElementById('sheet')?.dataset.intro === 'play') log.introAt = Math.min(log.introAt, performance.now())
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-intro'] })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (entry.startTime >= log.introAt && !entry.hadRecentInput) log.shift += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await loaded(page)
      await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
      await expect(page.locator('#sheet')).not.toHaveAttribute('data-intro', 'play', { timeout: 4000 })
      const log = await page.evaluate(() => (window as unknown as { introLog: { firstFrame: unknown; introAt: number; shift: number } }).introLog)
      const contourCount = await page.locator('#sheet path.contour').count()
      expect(log.firstFrame).toEqual({ animations: 0, contoursShown: contourCount })
      expect(log.introAt).toBeLessThan(Infinity)
      expect(log.shift).toBeLessThan(0.02)
    })
  }

  test('phases run in order: frame, contours, summits, trails, schedule, materials', async ({ page }) => {
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    // Read each phase's first start and last end on the intro's clock, from the animations themselves.
    // The hero's role cycle runs beside the intro and is left out.
    const timing = await page.evaluate(async () => {
      const animations = document.getElementById('sheet')!.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation))
      await Promise.all(animations.map((animation) => animation.ready))
      const zero = Math.min(...animations.map((animation) => animation.startTime as number))
      const phases: Record<string, { start: number; end: number }> = {}
      const levels: Record<string, number> = {}
      for (const animation of animations) {
        const effect = animation.effect as KeyframeEffect
        const target = effect.target as Element
        const phase = target.closest<HTMLElement | SVGElement>('[data-phase]')?.dataset.phase ?? 'none'
        const delay = Number(effect.getTiming().delay)
        const start = (animation.startTime as number) - zero + delay
        const end = start + Number(effect.getTiming().duration)
        const known = phases[phase]
        phases[phase] = { start: Math.min(known?.start ?? Infinity, start), end: Math.max(known?.end ?? -Infinity, end) }
        const level = target.closest<SVGElement>('[data-level]')?.dataset.level
        if (level !== undefined) levels[level] = Math.min(levels[level] ?? Infinity, start)
      }
      return { phases, levels }
    })
    expect(Object.keys(timing.phases).sort()).toEqual([...PHASES].sort())
    const starts = PHASES.map((phase) => timing.phases[phase].start)
    expect(starts, `phase starts ${starts.join(', ')}`).toEqual([...starts].sort((a, b) => a - b))
    expect(new Set(starts).size).toBe(PHASES.length)
    // About 2.5 s in all.
    const end = Math.max(...PHASES.map((phase) => timing.phases[phase].end))
    expect(end).toBeGreaterThan(2200)
    expect(end).toBeLessThan(2900)
    // The contours draw outward from the summits: the highest level first.
    const byLevel = Object.entries(timing.levels)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([, start]) => start)
    const shownLevels = await page.evaluate(() => [...document.querySelectorAll('#sheet svg')].filter((svg) => svg.getClientRects().length > 0).flatMap((svg) => [...svg.querySelectorAll('g[data-level]')]).length)
    expect(shownLevels).toBeGreaterThan(1)
    expect(byLevel.length).toBe(shownLevels)
    expect(byLevel).toEqual([...byLevel].sort((a, b) => a - b))
    expect(byLevel[0]).toBeLessThan(byLevel[byLevel.length - 1])
  })

  test('Skip intro cancels every animation and leaves the settled sheet', { tag: '@smoke' }, async ({ page }) => {
    const start = await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    await page.waitForFunction((from) => performance.now() - from >= 600, start)
    await page.locator('#intro-skip').click()
    expectSettled(await sheetState(page), 'after Skip')
    await expect(page.locator('#intro-replay')).toBeFocused()
    await expect(page.locator('#sheet .materials li[data-material]').first()).toBeVisible()
  })

  test('Replay intro plays it again', async ({ page }) => {
    await page.addInitScript((key) => window.sessionStorage.setItem(key, '1'), INTRO_KEY)
    await loaded(page)
    await page.waitForTimeout(300)
    expectSettled(await sheetState(page), 'before Replay')
    await page.locator('#intro-replay').click()
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    expect(await scripted(page)).toBeGreaterThan(0)
    await expect(page.locator('#intro-skip')).toBeVisible()
    await expect(page.locator('#sheet')).not.toHaveAttribute('data-intro', 'play', { timeout: 4000 })
    expectSettled(await sheetState(page), 'after Replay')
  })

  test('opening search mid-intro cancels it', async ({ page }) => {
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('#palette')).toBeVisible()
    expectSettled(await sheetState(page), 'palette')
  })

  test('with reduced motion, document.getAnimations() is empty after load', { tag: '@smoke' }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loaded(page)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    expectSettled(await sheetState(page), 'reduced motion')
    await expect(page.locator('#intro-replay')).toBeHidden()
    expect(await page.evaluate((key) => sessionStorage.getItem(key), INTRO_KEY)).toBeNull()
  })

  test('at 390 px the intro plays and settles with no horizontal scroll', { tag: '@smoke' }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await expect(page.locator('#sheet')).not.toHaveAttribute('data-intro', 'play', { timeout: 4000 })
    expectSettled(await sheetState(page), 'settled at 390')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})

test.describe('reduced motion', () => {
  test('the materials schedule is visible at first paint and the roles are listed statically', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Read the first frame in which the materials schedule exists, before anything else can run on it.
    await page.addInitScript(() => {
      const look = () => {
        const schedule = document.querySelector<HTMLElement>('#sheet .materials')
        if (!schedule) {
          requestAnimationFrame(look)
          return
        }
        const style = getComputedStyle(schedule)
        ;(window as unknown as { firstSchedule: unknown }).firstSchedule = {
          display: style.display,
          opacity: style.opacity,
          visibility: style.visibility,
          animations: schedule.getAnimations({ subtree: true }).length,
        }
      }
      requestAnimationFrame(look)
    })
    await loaded(page)
    await expect.poll(() => page.evaluate(() => (window as unknown as { firstSchedule?: unknown }).firstSchedule)).toEqual({
      display: 'block',
      opacity: '1',
      visibility: 'visible',
      animations: 0,
    })

    const held = page.locator('.roles-held')
    await expect(held).toBeVisible()
    for (const title of cycleTitles) await expect(held).toContainText(title)
    await expect(page.locator('.role-cycle')).toHaveCount(0)
    await expect(page.locator('.hero .role')).toHaveText(model.hero.roleLine)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })

  test('without JavaScript the materials schedule and the roles are static content', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('#sheet .materials')).toBeVisible()
    await expect(page.locator('#sheet .materials li[data-material]')).toHaveCount(model.materials.length)
    await expect(page.locator('.roles-held')).toBeVisible()
    await expect(page.locator('#intro-skip')).toBeHidden()
    await expect(page.locator('#intro-replay')).toBeHidden()
    await context.close()
  })
})

test.describe('role cycle', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a later page in the session lists the roles held, from first paint', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('kp-roles-seen', '1')
      window.sessionStorage.setItem('kp-intro-seen', '1')
    })
    await page.goto('/')
    const held = page.locator('.roles-held')
    await expect(held).toBeVisible()
    for (const title of cycleTitles) await expect(held).toContainText(title)
    await expect(page.locator('html')).toHaveAttribute('data-roles-seen', '')
  })

  test('cycles once through the roles, settles on the role line, and shifts nothing', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = []
      const shifts: string[] = []
      let cycleStart = Infinity
      ;(window as unknown as { roleLog: unknown }).roleLog = { seen, shifts }
      new MutationObserver(() => {
        const overlay = document.querySelector('.role-cycle')
        const text = overlay?.textContent ?? ''
        if (overlay) cycleStart = Math.min(cycleStart, performance.now())
        if (text && seen[seen.length - 1] !== text) seen.push(text)
      }).observe(document, { subtree: true, childList: true, characterData: true })
      // A role line that changed height would move the hero below it vertically, so horizontal-only
      // sources are left out.
      type Source = { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { sources?: Source[] })[]) {
          if (entry.startTime < cycleStart) continue
          for (const source of entry.sources ?? []) {
            const node = source.node instanceof Element ? source.node : source.node?.parentElement
            const vertical =
              Math.abs(source.previousRect.y - source.currentRect.y) > 0.5 || Math.abs(source.previousRect.height - source.currentRect.height) > 0.5
            if (vertical && node?.closest('.hero')) shifts.push(node.className || node.tagName)
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    // A web font landing mid-cycle moves glyphs inside their line boxes, which would read as a shift
    // the role line never caused. Fonts are blocked here; the hero's font independence has its own test.
    await page.route('**/fonts/*.woff2', (route) => route.abort())
    const live: string[] = []
    await loaded(page)
    await page.exposeFunction('liveChanged', (text: string) => live.push(text))
    await page.evaluate(() => {
      const region = document.getElementById('island-live')!
      new MutationObserver(() => (window as unknown as { liveChanged(text: string): void }).liveChanged(region.textContent ?? '')).observe(region, {
        subtree: true,
        childList: true,
        characterData: true,
      })
    })

    const overlay = page.locator('.role-cycle')
    await expect(overlay).toHaveAttribute('aria-hidden', 'true')
    const heights: number[] = []
    for (let sample = 0; sample < 12; sample++) {
      heights.push(await page.locator('[data-role-box]').evaluate((box) => Math.round(box.getBoundingClientRect().height * 10) / 10))
      await page.waitForTimeout(150)
    }
    await expect(overlay).toHaveCount(0, { timeout: 5000 })
    heights.push(await page.locator('[data-role-box]').evaluate((box) => Math.round(box.getBoundingClientRect().height * 10) / 10))
    expect(new Set(heights).size, `role box heights ${heights.join(', ')}`).toBe(1)

    const log = await page.evaluate(() => (window as unknown as { roleLog: { seen: string[]; shifts: string[] } }).roleLog)
    expect(log.seen).toEqual(cycleTitles)
    expect(log.shifts).toEqual([])
    await expect(page.locator('.hero .role')).toHaveText(model.hero.roleLine)
    await expect(page.locator('.hero .role')).toHaveCSS('opacity', '1')
    await expect(page.locator('.roles-held')).toBeHidden()
    for (const title of cycleTitles) for (const text of live) expect(text).not.toContain(title)
  })

  test('the hero role cycle still runs once per session', async ({ page }) => {
    await loaded(page)
    // The sheet's intro plays beside it on the first visit and does not stop it.
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    await expect(page.locator('.role-cycle')).toHaveCount(1)
    await loaded(page)
    await page.waitForTimeout(200)
    await expect(page.locator('.role-cycle')).toHaveCount(0)
  })
})

// A web font that lands after first paint must not re-wrap a hero line, or the hero below it jumps.
// The thesis italic is font-display optional and its stand-in is a slanted regular; the display
// face swaps and its stand-in is the size-matched Arial or Liberation Sans face.
test.describe('hero layout does not depend on a late web font', () => {
  const boxes = (page: Page) =>
    page.evaluate(() =>
      ['.name', '[data-role-box]', '.thesis', '.langs', '.jump'].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect()
        return `${selector} y${Math.round(rect.y)} h${Math.round(rect.height)}`
      }),
    )
  const faces = [
    { label: 'the italic', pattern: '**/fonts/*thesis*.woff2' },
    { label: 'the display face', pattern: '**/fonts/bricolage*.woff2' },
  ]
  for (const width of [390, 1280]) for (const face of faces) {
    test(`at ${width} px the hero boxes match with ${face.label} blocked and loaded`, async ({ browser }) => {
      const readings: string[][] = []
      for (const block of [true, false]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } })
        await context.addInitScript(() => {
          sessionStorage.setItem('kp-intro-seen', '1')
          sessionStorage.setItem('kp-roles-seen', '1')
        })
        const page = await context.newPage()
        if (block) await page.route(face.pattern, (route) => route.abort())
        await loaded(page)
        await page.evaluate(() => document.fonts.ready)
        readings.push(await boxes(page))
        await context.close()
      }
      expect(readings[0]).toEqual(readings[1])
    })
  }
})
