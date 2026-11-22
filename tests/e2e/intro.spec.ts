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

// The intro starts three frames after the island is ready, and under load (WebKit with every worker
// busy) a frame can take most of a second, so these wait for frames and for the intro's own
// animation clock rather than for a time. Resolves, in the frame the intro starts, to the latest end
// of its animations on that clock (ms).
async function introPlaying(page: Page): Promise<number> {
  const end = await page.waitForFunction(
    () => {
      const sheet = document.getElementById('sheet')
      if (sheet?.dataset.intro !== 'play') return false
      const animations = sheet.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation))
      return animations.length > 0 && Math.max(...animations.map((animation) => Number(animation.effect!.getComputedTiming().endTime)))
    },
    undefined,
    { polling: 'raf' },
  )
  // waitForFunction resolves only on a truthy value, so it is the number.
  return (await end.jsonValue()) as number
}

const introOver = (page: Page) => page.waitForFunction(() => document.getElementById('sheet')?.dataset.intro === undefined, undefined, { polling: 'raf' })

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
    await introOver(page)
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
        const log = { firstFrame: null as null | { animations: number; contoursShown: number }, settledFrame: -1, introFrame: -1, introAt: Infinity, shift: 0 }
        ;(window as unknown as { introLog: typeof log }).introLog = log
        // Counts animation frames. Registered first, so it ticks before any other callback in a frame.
        let frame = 0
        const count = () => {
          frame++
          requestAnimationFrame(count)
        }
        requestAnimationFrame(count)
        const look = () => {
          const sheet = document.getElementById('sheet')
          if (!sheet) {
            requestAnimationFrame(look)
            return
          }
          const contours = [...sheet.querySelectorAll('path.contour')]
          // The sheet's own scripted animations: the hero's role cycle beside it may already be
          // stepping in this frame, and it is not the intro.
          log.firstFrame ??= {
            animations: sheet.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation)).length,
            contoursShown: contours.filter((path) => getComputedStyle(path).strokeDasharray === 'none').length,
          }
          // The intro is started as the island gets ready, so the first frame after that is the
          // first that paints the settled sheet with the intro waiting on it. Its callbacks run
          // before the intro's own, since this one was registered first.
          if (document.documentElement.dataset.island !== 'ready') {
            requestAnimationFrame(look)
            return
          }
          log.settledFrame = frame
        }
        requestAnimationFrame(look)
        new MutationObserver(() => {
          if (document.getElementById('sheet')?.dataset.intro !== 'play' || log.introFrame >= 0) return
          log.introAt = performance.now()
          log.introFrame = frame
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-intro'] })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (entry.startTime >= log.introAt && !entry.hadRecentInput) log.shift += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await loaded(page)
      await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
      await introOver(page)
      const log = await page.evaluate(
        () => (window as unknown as { introLog: { firstFrame: unknown; settledFrame: number; introFrame: number; introAt: number; shift: number } }).introLog,
      )
      const contourCount = await page.locator('#sheet path.contour').count()
      expect(log.firstFrame).toEqual({ animations: 0, contoursShown: contourCount })
      expect(log.introAt).toBeLessThan(Infinity)
      expect(log.settledFrame).toBeGreaterThan(0)
      expect(log.introFrame - log.settledFrame, `settled in frame ${log.settledFrame}, intro in frame ${log.introFrame}`).toBeGreaterThanOrEqual(2)
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
    await loaded(page)
    await introPlaying(page)
    // Held 600 ms into the intro, mid-draw, so a slow frame cannot let it run out before the click.
    await page.evaluate(() => {
      for (const animation of document.getElementById('sheet')!.getAnimations({ subtree: true })) {
        if (animation instanceof CSSAnimation) continue
        animation.pause()
        animation.currentTime = 600
      }
    })
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
    await introOver(page)
    expectSettled(await sheetState(page), 'after Replay')
  })

  test('opening search mid-intro cancels it', async ({ page }) => {
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('#palette')).toBeVisible()
    expectSettled(await sheetState(page), 'palette')
  })

  // The intro waits two frames for the settled sheet to paint. A stop in that wait (here a hash
  // change, dispatched as soon as the island is ready) skips the intro, and it still counts as seen.
  test('a stop while the intro waits for first paint still marks it seen for the session', async ({ page }) => {
    await page.addInitScript(() => {
      const log = { played: false }
      ;(window as unknown as { stopLog: typeof log }).stopLog = log
      // The document element does not exist yet when this runs, so the document is observed.
      new MutationObserver((_, observer) => {
        if (document.documentElement.dataset.island !== 'ready') return
        observer.disconnect()
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-island'] })
      new MutationObserver(() => {
        if (document.getElementById('sheet')?.dataset.intro === 'play') log.played = true
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-intro'] })
    })
    await loaded(page)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
    expect(await page.evaluate(() => (window as unknown as { stopLog: { played: boolean } }).stopLog.played)).toBe(false)
    expect(await page.evaluate((key) => sessionStorage.getItem(key), INTRO_KEY)).toBe('1')
    expectSettled(await sheetState(page), 'stopped before it started')
  })

  // A draw that throws partway (here the 40th animation on the sheet) cancels the animations it
  // already made, so none is left holding an element faded or half drawn. The error still surfaces.
  test('an intro that fails partway through its setup leaves the settled sheet', async ({ page }) => {
    await page.addInitScript(() => {
      let made = 0
      const animate = Element.prototype.animate
      Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
        if (this.closest('#sheet') && ++made === 40) throw new Error('injected intro failure')
        return animate.apply(this, args)
      }
    })
    const failure = page.waitForEvent('pageerror')
    await page.goto('/')
    expect((await failure).message).toContain('injected intro failure')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expectSettled(await sheetState(page), 'after a failed setup')
  })

  // Under vector-effect: non-scaling-stroke every engine measures a dash in CSS pixels, not in the
  // drawing's units, so a contour's dash must be its length on screen. The 880 px sheet is drawn
  // below scale 1, where a dash in drawing units runs out early. Each sample pauses the contour's
  // animation at a share of its duration and reads how much of the path its dash covers.
  test('at 880 px a contour is still drawing at 90 % of its animation and is fully drawn only at its end', { tag: '@smoke' }, async ({ page }) => {
    await page.setViewportSize({ width: 880, height: 900 })
    await loaded(page)
    await expect(page.locator('#sheet')).toHaveAttribute('data-intro', 'play')
    const report = await page.evaluate(() => {
      const svg = [...document.querySelectorAll<SVGSVGElement>('#sheet svg[data-shape]')].find((item) => item.getClientRects().length > 0)!
      const scale = svg.getScreenCTM()!.a
      const paths = [...svg.querySelectorAll<SVGPathElement>('path.contour')]
      const path = paths.reduce((longest, item) => (item.getTotalLength() > longest.getTotalLength() ? item : longest))
      const animation = path.getAnimations().find((item) => !(item instanceof CSSAnimation))!
      animation.pause()
      const timing = animation.effect!.getTiming()
      const onScreen = path.getTotalLength() * scale
      const drawnAt = (share: number) => {
        animation.currentTime = Number(timing.delay) + share * Number(timing.duration)
        const style = getComputedStyle(path)
        return (parseFloat(style.strokeDasharray) - parseFloat(style.strokeDashoffset)) / onScreen
      }
      const [first] = (animation.effect as KeyframeEffect).getKeyframes()
      return { scale, mid: drawnAt(0.5), late: drawnAt(0.9), near: drawnAt(0.95), dash: parseFloat(String(first.strokeDasharray)), onScreen }
    })
    expect(report.scale).toBeLessThan(1)
    expect(report.mid, 'mid-animation').toBeLessThan(1)
    expect(report.late, 'at 90 %').toBeLessThan(1)
    expect(report.near, 'at 95 %').toBeGreaterThan(0.99)
    expect(report.near, 'at 95 %').toBeLessThan(1)
    // The dash is the path's length on screen, so the last instant of the animation draws its end.
    expect(Math.abs(report.dash - report.onScreen), `dash ${report.dash} for ${report.onScreen} px`).toBeLessThan(0.5)
  })

  // The probe behind the dash: a 200-unit line drawn at half and at double scale with a 100-unit dash
  // paints 100 CSS px either way when its stroke does not scale.
  test('under a non-scaling stroke a dash is measured in CSS pixels', { tag: '@smoke' }, async ({ page }) => {
    for (const scale of [0.5, 2]) {
      await page.setContent(
        `<body style="margin:0;background:#fff"><svg width="${200 * scale}" height="${20 * scale}" viewBox="0 0 200 20" style="display:block">` +
          '<path d="M0 10H200" stroke="#000" stroke-width="4" vector-effect="non-scaling-stroke" stroke-dasharray="100 1000" fill="none"/></svg>',
      )
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 200 * scale, height: 20 * scale }, scale: 'css' })
      const painted = await page.evaluate(async (png) => {
        const image = new Image()
        image.src = `data:image/png;base64,${png}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, image.width, image.height)
        let columns = 0
        for (let x = 0; x < image.width; x++) {
          let dark = false
          for (let y = 0; y < image.height; y++) if (data[(y * image.width + x) * 4] < 128) dark = true
          if (dark) columns++
        }
        return columns
      }, shot.toString('base64'))
      expect(Math.abs(painted - 100), `scale ${scale}: ${painted} px painted`).toBeLessThanOrEqual(2)
    }
  })

  // Under 4x CPU throttling at 1280 x 1400, nothing on the home page moves once painted, with the
  // intro playing or skipped. The sum of every shift is at least the page's CLS.
  for (const intro of ['playing', 'skipped'] as const) {
    test(`layout shift under 4x CPU throttling at 1280 x 1400 stays under 0.005 with the intro ${intro}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools protocol call')
      await page.setViewportSize({ width: 1280, height: 1400 })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await page.addInitScript((skip) => {
        if (skip) sessionStorage.setItem('kp-intro-seen', '1')
        const log = { shift: 0, sources: [] as string[] }
        ;(window as unknown as { shiftLog: typeof log }).shiftLog = log
        type Source = { node?: Node }
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Source[] })[]) {
            if (entry.hadRecentInput) continue
            log.shift += entry.value
            for (const source of entry.sources ?? []) {
              const node = source.node instanceof Element ? source.node : source.node?.parentElement
              log.sources.push(`${Math.round(entry.startTime)} ms ${node ? node.id || node.className : 'unknown'}`)
            }
          }
        }).observe({ type: 'layout-shift', buffered: true })
      }, intro === 'skipped')
      await loaded(page)
      // The intro runs about 2.5 s; the wait covers it, and a quiet page, either way.
      await page.waitForTimeout(3500)
      const log = await page.evaluate(() => (window as unknown as { shiftLog: { shift: number; sources: string[] } }).shiftLog)
      expect(log.shift, log.sources.join('; ')).toBeLessThan(0.005)
    })
  }

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
    // It is timed to end inside 4 s of its own clock, and then ends on its own, however slowly the frames come.
    expect(await introPlaying(page)).toBeLessThan(4000)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await introOver(page)
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
