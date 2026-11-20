import { expect, test, type Page } from '@playwright/test'
import { cycleTitles, model } from '../../src/model'

// The exploded-assembly intro on the Plan lens, the bill of materials it ends on, and the role
// cycle in the hero. Every test starts in a fresh browser context, so sessionStorage is empty and
// a first visit plays the intro unless reduced motion is on.
const INTRO_KEY = 'kp-intro-seen'
const BANDS = [
  { id: 'language', label: 'Primary languages' },
  { id: 'stack', label: 'Frameworks and stacks' },
  { id: 'tool', label: 'Platforms and tools' },
  { id: 'discipline', label: 'Disciplines' },
] as const
const proofLabel = (id: string) => model.proofs.find((proof) => proof.id === id)!.label

async function loaded(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  return page.evaluate(() => performance.now())
}

const waitUntil = (page: Page, start: number, ms: number) =>
  page.waitForFunction(([from, after]) => performance.now() - from >= after, [start, ms] as const, { polling: 10 })

// One reading of everything the intro may leave behind.
const introState = (page: Page) =>
  page.evaluate(() => {
    const stage = document.getElementById('stage')!
    const boxes = [...document.querySelectorAll<HTMLElement>('#stage .node-box')]
    const parts = [...document.querySelectorAll<SVGGElement>('#stage [data-part]')]
    const bom = document.querySelector<HTMLElement>('#stage .bom')!
    const rows = [...bom.querySelectorAll<HTMLElement>('li[data-material]')]
    const moved = (element: Element) => getComputedStyle(element).transform !== 'none'
    return {
      intro: stage.dataset.intro ?? null,
      settled: stage.dataset.settled ?? null,
      axes: document.querySelectorAll('#stage [data-intro-axes]').length,
      nodeAnimations: boxes.reduce((count, box) => count + box.getAnimations().length, 0),
      nodeTransforms: boxes.filter(moved).length,
      partTransforms: parts.filter(moved).length,
      parts: parts.map((part) => part.dataset.part),
      bomAnimations: bom.getAnimations({ subtree: true }).length,
      bomOpacity: Number(getComputedStyle(bom).opacity),
      bomShown: getComputedStyle(bom).display !== 'none',
      clippedRows: rows.filter((row) => getComputedStyle(row).clipPath !== 'none' || Number(getComputedStyle(row).opacity) < 1).length,
      skipHidden: (document.getElementById('intro-skip') as HTMLButtonElement).hidden,
      seen: (() => {
        try {
          return sessionStorage.getItem('kp-intro-seen')
        } catch {
          return 'blocked'
        }
      })(),
    }
  })

const languageIds = model.materials.filter((material) => material.band === 'language').map((material) => material.id)

function expectAssembled(state: Awaited<ReturnType<typeof introState>>, label: string) {
  expect(state.intro, `${label}: intro marker`).toBeNull()
  expect(state.axes, `${label}: assembly axes`).toBe(0)
  expect(state.nodeAnimations, `${label}: node animations`).toBe(0)
  expect(state.nodeTransforms, `${label}: node transforms`).toBe(0)
  expect(state.partTransforms, `${label}: part transforms`).toBe(0)
  expect(state.bomAnimations, `${label}: bill of materials animations`).toBe(0)
  expect(state.bomOpacity, `${label}: bill of materials opacity`).toBe(1)
  expect(state.clippedRows, `${label}: half-drawn rows`).toBe(0)
  expect(state.skipHidden, `${label}: skip control`).toBe(true)
}

test.describe('first visit at 1280 px, light', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })

  test('the intro is in flight at 900 ms and fully assembled by 4 s', async ({ page }) => {
    const start = await loaded(page)
    await waitUntil(page, start, 900)
    const flight = await introState(page)
    expect(flight.intro).toBe('play')
    expect(flight.settled).toBeNull()
    expect(flight.axes).toBe(1)
    expect(flight.nodeAnimations).toBeGreaterThanOrEqual(6)
    expect(flight.parts).toEqual(languageIds)
    expect(flight.bomAnimations).toBeGreaterThan(0)
    expect(flight.skipHidden).toBe(false)
    expect(flight.seen).toBe('1')
    await expect(page.locator('#intro-skip')).toBeVisible()
    await expect(page.locator('#intro-replay')).toBeVisible()

    await waitUntil(page, start, 4000)
    const after = await introState(page)
    expectAssembled(after, 'at 4 s')
    expect(after.settled).toBe('plan')
    expect(after.bomShown).toBe(true)
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation)).length)).toBe(0)
  })

  test('a second navigation in the same session shows the assembled map with no intro', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').click()
    const start = await loaded(page)
    expect(await page.evaluate(() => sessionStorage.getItem('kp-intro-seen'))).toBe('1')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 500 })
    await waitUntil(page, start, 300)
    expectAssembled(await introState(page), 'second load')
  })

  test('Skip ends the intro at once with the bill of materials visible', async ({ page }) => {
    const start = await loaded(page)
    await waitUntil(page, start, 600)
    await page.locator('#intro-skip').click()
    const state = await introState(page)
    expectAssembled(state, 'after Skip')
    expect(state.settled).toBe('plan')
    await expect(page.locator('#stage .bom')).toBeVisible()
    await expect(page.locator('#intro-replay')).toBeFocused()
  })

  test('pressing 3 mid-intro cancels it cleanly and the plan comes back assembled', async ({ page }) => {
    const start = await loaded(page)
    await waitUntil(page, start, 1000)
    await page.keyboard.press('3')
    const right = await introState(page)
    expect(right.intro).toBeNull()
    expect(right.axes).toBe(0)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'console', { timeout: 5000 })
    const settled = await introState(page)
    expect(settled.nodeAnimations).toBe(0)
    expect(settled.nodeTransforms).toBe(0)
    expect(settled.bomShown).toBe(false)
    expect(settled.bomAnimations).toBe(0)
    await page.keyboard.press('1')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 5000 })
    expectAssembled(await introState(page), 'back on plan')
  })

  test('opening the palette or the drawer mid-intro cancels it', async ({ page }) => {
    let start = await loaded(page)
    await waitUntil(page, start, 800)
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('#palette')).toBeVisible()
    expectAssembled(await introState(page), 'palette')
    expect((await introState(page)).settled).toBe('plan')

    // A fresh session for the drawer case.
    await page.evaluate(() => sessionStorage.clear())
    start = await loaded(page)
    await waitUntil(page, start, 800)
    await page.locator(`#stage [data-node="${model.domains[0].id}"]`).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#drawer')).toBeVisible()
    expectAssembled(await introState(page), 'drawer')
  })

  test('Replay plays the intro again, from any lens', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').click()
    await page.locator('#intro-replay').click()
    let state = await introState(page)
    expect(state.intro).toBe('play')
    expect(state.axes).toBe(1)
    await page.locator('#intro-skip').click()
    await page.keyboard.press('4')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'index', { timeout: 5000 })
    await page.locator('#intro-replay').click()
    await expect(page.locator('#stage')).toHaveAttribute('data-intro', 'play')
    expect(await page.locator('#stage').getAttribute('data-lens')).toBe('plan')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 6000 })
    state = await introState(page)
    expectAssembled(state, 'replay end')
  })

  test('the intro does not play when the visit starts in another lens', async ({ page }) => {
    const start = await loaded(page, '/#lens-console')
    await waitUntil(page, start, 300)
    expect((await introState(page)).intro).toBeNull()
    expect(await page.evaluate((key) => sessionStorage.getItem(key), INTRO_KEY)).toBeNull()
  })
})

test.describe('first visit at 390 px, dark', () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })

  test('the intro plays and settles with no horizontal scroll', async ({ page }) => {
    const start = await loaded(page)
    await waitUntil(page, start, 900)
    expect((await introState(page)).intro).toBe('play')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 5000 })
    expectAssembled(await introState(page), 'settled at 390')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})

test.describe('bill of materials', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('four bands from the model; each row lists where used and opens the drawer as a material', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loaded(page)
    const bom = page.locator('#stage .bom')
    for (const band of BANDS) {
      const section = bom.locator(`[data-band="${band.id}"]`)
      await expect(section.locator('.bom-band-h')).toHaveText(band.label)
      const materials = model.materials.filter((material) => material.band === band.id)
      const rows = section.locator('li[data-material]')
      await expect(rows).toHaveCount(materials.length)
      for (const material of materials) {
        const row = section.locator(`li[data-material="${material.id}"] button.bom-row`)
        await expect(row.locator('.mt')).toHaveText(material.name)
        const used = (await row.locator('.used').textContent()) ?? ''
        for (const id of material.usedIn) expect(used, `${material.id} lists ${id}`).toContain(proofLabel(id))
      }
    }
    expect(await bom.textContent()).not.toMatch(/HIP-?\d/)

    const solidity = bom.locator('li[data-material="solidity"] button.bom-row')
    await solidity.click()
    await expect(page.locator('#drawer')).toBeVisible()
    await expect(page.locator('#drawer-title')).toHaveText('Solidity')
    await expect(page.locator('[data-drawer-eyebrow]')).toHaveText('Language')
    await expect(solidity).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(solidity).toBeFocused()
    await expect(solidity).toHaveAttribute('aria-expanded', 'false')
  })

  test('shows only on the Plan lens', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loaded(page)
    await expect(page.locator('#stage .bom')).toBeVisible()
    await page.keyboard.press('3')
    await expect(page.locator('#stage .bom')).toBeHidden()
    await page.keyboard.press('1')
    await expect(page.locator('#stage .bom')).toBeVisible()
  })
})

test.describe('reduced motion', () => {
  test('the bill of materials is visible at first paint and the roles are listed statically', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Read the first frame in which the bill of materials exists, before anything else can run on it.
    await page.addInitScript(() => {
      const look = () => {
        const bom = document.querySelector<HTMLElement>('#stage .bom')
        if (!bom) {
          requestAnimationFrame(look)
          return
        }
        const style = getComputedStyle(bom)
        ;(window as unknown as { firstBom: unknown }).firstBom = {
          display: style.display,
          opacity: style.opacity,
          visibility: style.visibility,
          animations: bom.getAnimations({ subtree: true }).length,
        }
      }
      requestAnimationFrame(look)
    })
    await loaded(page)
    await expect.poll(() => page.evaluate(() => (window as unknown as { firstBom?: unknown }).firstBom)).toEqual({
      display: 'block',
      opacity: '1',
      visibility: 'visible',
      animations: 0,
    })
    const state = await introState(page)
    expectAssembled(state, 'reduced motion')
    expect(state.settled).toBe('plan')
    expect(state.seen).toBeNull()
    await expect(page.locator('#intro-replay')).toBeHidden()

    const held = page.locator('.roles-held')
    await expect(held).toBeVisible()
    for (const title of cycleTitles) await expect(held).toContainText(title)
    await expect(page.locator('.role-cycle')).toHaveCount(0)
    await expect(page.locator('.hero .role')).toHaveText(model.hero.roleLine)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })

  test('without JavaScript the bill of materials and the roles are static content', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('#stage .bom')).toBeVisible()
    await expect(page.locator('#stage .bom li[data-material]')).toHaveCount(model.materials.length)
    await expect(page.locator('.roles-held')).toBeVisible()
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

  test('keys 1 to 5 leave the intro running while shortcuts are off', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('kp-shortcuts', 'off'))
    await page.goto('/')
    await expect(page.locator('#intro-skip')).toBeVisible()
    await page.keyboard.press('3')
    await page.waitForTimeout(150)
    await expect(page.locator('#stage')).toHaveAttribute('data-intro', /.+/)
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
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
      // A role line that changed height would move the hero below it vertically. The web-font swap
      // early in the load reflows text sideways only, so horizontal-only sources are left out.
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

  test('runs once per session', async ({ page }) => {
    await loaded(page)
    await expect(page.locator('.role-cycle')).toHaveCount(1)
    await loaded(page)
    await page.waitForTimeout(200)
    await expect(page.locator('.role-cycle')).toHaveCount(0)
  })
})

test.describe('focus when Skip hides', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('focus on Skip moves to Replay when the intro runs out', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').focus()
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 6000 })
    await expect(page.locator('#intro-skip')).toBeHidden()
    await expect(page.locator('#intro-replay')).toBeFocused()
  })

  test('pressing Skip from the keyboard moves focus to Replay', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').focus()
    await page.keyboard.press('Enter')
    expectAssembled(await introState(page), 'keyboard Skip')
    await expect(page.locator('#intro-replay')).toBeFocused()
  })

  test('with Replay hidden by reduced motion, focus on Skip moves to the first Plan node', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').focus()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('#intro-replay')).toBeHidden()
    await expect(page.locator(`#stage [data-node="${model.domains[0].id}"]`)).toBeFocused()
    expectAssembled(await introState(page), 'reduced motion mid-intro')
  })

  test('with Replay hidden and the nodes unable to take focus, focus on Skip moves to the stage', async ({ page }) => {
    await loaded(page)
    await page.locator('#intro-skip').focus()
    // The nodes cannot take focus: their box is inert.
    await page.evaluate(() => document.querySelector('#stage .stage-box')!.setAttribute('inert', ''))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('#intro-replay')).toBeHidden()
    await expect(page.locator('#stage')).toBeFocused()
    await expect(page.locator('#stage')).toHaveAttribute('tabindex', '-1')
  })
})

test.describe('other cancel paths', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  const paths: [string, (page: Page) => Promise<unknown>][] = [
    ['a click on a lens button', (page) => page.locator('[data-lens-button="index"]').click()],
    ['a hash change', (page) => page.evaluate(() => (window.location.hash = '#lens-index'))],
  ]
  for (const [name, act] of paths) {
    test(`${name} mid-intro cancels it and leaves nothing behind`, async ({ page }) => {
      const start = await loaded(page)
      await waitUntil(page, start, 900)
      await act(page)
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'index', { timeout: 5000 })
      const state = await introState(page)
      expect(state.intro).toBeNull()
      expect(state.axes).toBe(0)
      expect(state.nodeTransforms).toBe(0)
      expect(state.bomAnimations).toBe(0)
      expect(state.skipHidden).toBe(true)
    })
  }
})

// The settled Plan drawing: balloons, callout labels and the hub's language parts stay inside the
// stage and clear of each other and of the nodes, measured after the web fonts have arrived.
// At a 720 px viewport the stage box is 688 px, so Plan uses its two-column layout; 1024 covers the
// three-column sheet with the revision table below it, and 1280 the sheet with the table beside it.
const leads = model.domains.map((domain) => model.proofs.find((proof) => proof.domainId === domain.id)!.label)
// The settled Plan drawing: balloons, labels and hub parts inside the stage with no overlap.
async function expectPlanExtras(page: Page, width: number) {
  const report = await page.evaluate(async () => {
    await document.fonts.ready
    const stage = document.querySelector('#stage .stage-box')!.getBoundingClientRect()
    type Item = { kind: string; id: string; left: number; top: number; right: number; bottom: number }
    const items: Item[] = []
    const add = (kind: string, id: string, element: Element) => {
      const rect = element.getBoundingClientRect()
      items.push({ kind, id, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
    }
    document.querySelectorAll<HTMLElement>('#stage .node-box').forEach((box) => {
      add('node', box.dataset.domain!, box)
      const num = box.querySelector('.n-num')
      if (num) add('num', box.dataset.domain!, num)
    })
    document.querySelectorAll('#stage [data-deco="plan"] .cal').forEach((call, i) => {
      add('balloon', String(i), call.querySelector('.cal-c')!)
      add('label', String(i), call.querySelector('.cal-t')!)
    })
    document.querySelectorAll('#stage [data-part]').forEach((part) => add('part', (part as SVGGElement).dataset.part!, part.querySelector('rect')!))
    add('hub', 'hub', document.querySelector('#stage .hub-box')!)
    add('dim', 'dim', document.querySelector('#stage [data-phase="dim"] .gap-bg')!)
    add('sheet', 'sheet', document.querySelector('#stage .plan-sheet')!)
    const outside = [...document.querySelectorAll('#stage [data-deco="plan"] .cal, #stage [data-part], #stage .hub-box')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.left < stage.left - 1 || rect.right > stage.right + 1 || rect.top < stage.top - 1 || rect.bottom > stage.bottom + 1).length
    const allowed = (a: Item, b: Item) =>
      (a.kind === 'hub' && b.kind === 'part') || (b.kind === 'hub' && a.kind === 'part') || (a.id === b.id && [a.kind, b.kind].sort().join() === 'node,num')
    const overlaps: string[] = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        if (allowed(a, b)) continue
        const hit = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
        if (hit) overlaps.push(`${a.kind} ${a.id} / ${b.kind} ${b.id}`)
      }
    }
    const labels = [...document.querySelectorAll('#stage [data-deco="plan"] .cal-t')].map((label) => ({
      text: label.textContent ?? '',
      squeezed: label.hasAttribute('textLength'),
    }))
    return { outside, overlaps, labels, scroll: document.documentElement.scrollWidth, counts: items.reduce<Record<string, number>>((all, item) => ({ ...all, [item.kind]: (all[item.kind] ?? 0) + 1 }), {}) }
  })
  expect(report.counts).toMatchObject({ node: 6, num: 6, balloon: 6, label: 6, part: 4, hub: 1, dim: 1, sheet: 1 })
  expect(report.outside, 'elements outside the stage').toBe(0)
  expect(report.overlaps).toEqual([])
  expect(report.scroll).toBe(width)
  report.labels.forEach((label, i) => {
    const full = leads[i]
    expect(label.squeezed, `label ${i} condensed`).toBe(false)
    if (label.text === full) return
    // Cut only at a word boundary, followed by the ellipsis, and never down to nothing.
    expect(label.text.endsWith('…'), `label ${i}: ${label.text}`).toBe(true)
    const kept = label.text.slice(0, -1)
    expect(kept.length, `label ${i}`).toBeGreaterThan(0)
    expect(full.startsWith(`${kept} `), `label ${i}: ${label.text} vs ${full}`).toBe(true)
  })
}

for (const width of [390, 720, 1024, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`settled Plan extras at ${width} px, ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 900 }, colorScheme })

      test('balloons, labels and hub parts sit inside the stage with no overlap', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await loaded(page)
        await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
        await expectPlanExtras(page, width)
      })
    })
  }
}

// The same checks after the intro plays out with motion on, so the settle it ends on is the one measured.
for (const width of [390, 1280]) {
  test.describe(`Plan extras after the intro plays at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('balloons, labels and hub parts sit inside the stage with no overlap', async ({ page }) => {
      await loaded(page)
      await expect(page.locator('#intro-skip')).toBeVisible()
      await expect(page.locator('#intro-skip')).toBeHidden({ timeout: 8000 })
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
      await expect.poll(() => page.evaluate(() => document.querySelector('#stage .stage-box')!.getAnimations({ subtree: true }).length)).toBe(0)
      await expectPlanExtras(page, width)
    })
  })
}
