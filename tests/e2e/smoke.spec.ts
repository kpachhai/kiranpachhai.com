import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

// The cross-engine smoke subset: island core, every lens settling, Terrain, the intro's Skip and
// the provenance toggle, each at 390 and 1280 px. Firefox and WebKit run only tests tagged @smoke
// (static.spec.ts carries the same tag); Chromium runs these with everything else.
const LENSES = ['plan', 'terrain', 'console', 'index', 'range'] as const
const KEY = { plan: '1', terrain: '2', console: '3', index: '4', range: '5' } as const
const firstDomain = model.domains[0]

function skipIntro(page: Page) {
  return page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('kp-intro-seen', '1')
      window.sessionStorage.setItem('kp-roles-seen', '1')
    } catch {
      // Storage blocked: the intro plays, which these tests tolerate.
    }
  })
}

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`smoke at ${viewport.width} px`, { tag: '@smoke' }, () => {
    test.use({ viewport })

    test('island core: palette, drawer, theme', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      await page.locator('#palette-open').click()
      await expect(page.locator('#palette')).toBeVisible()
      await expect(page.locator('#palette input')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.locator('#palette')).toBeHidden()

      const node = page.locator(`#stage [data-node="${firstDomain.id}"]`)
      await node.click()
      await expect(page.locator('#drawer')).toBeVisible()
      await expect(page.locator('#drawer h2')).toHaveText(firstDomain.name)
      await page.keyboard.press('Escape')
      await expect(page.locator('#drawer')).toBeHidden()
      await expect(node).toBeFocused()

      const theme = page.locator('#theme-toggle')
      await theme.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    })

    test('every lens settles from the bar and from its key', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
      for (const lens of LENSES) {
        await page.locator(`[data-lens-button="${lens}"]`).click()
        await expect(page.locator('#stage')).toHaveAttribute('data-settled', lens, { timeout: 8000 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth), lens).toBe(viewport.width)
      }
      await page.locator('#stage').click({ position: { x: 2, y: 2 } })
      await page.keyboard.press(KEY.console)
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'console', { timeout: 8000 })
    })

    test('terrain draws one canvas and releases it on leaving', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      await page.locator('[data-lens-button="terrain"]').click()
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'terrain', { timeout: 8000 })
      await expect(page.locator('canvas')).toHaveCount(1)
      await expect(page.locator('#stage .ter-legend')).toContainText('Summits are areas of work. Trails are shared methods.')
      await expect.poll(() => page.evaluate(() => Number(document.querySelector<HTMLCanvasElement>('#stage canvas')?.dataset.frames ?? 0))).toBeGreaterThan(0)
      await page.locator('[data-lens-button="index"]').click()
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'index', { timeout: 8000 })
      await expect(page.locator('canvas')).toHaveCount(0)
    })

    test('after a failed terrain load, pressing terrain again loads it', async ({ page }) => {
      await skipIntro(page)
      let blocked = 0
      await page.route(/\/_astro\/terrain\.[^/]*\.js/, (route) => {
        if (blocked === 0) {
          blocked++
          return route.abort()
        }
        return route.continue()
      })
      await ready(page)
      await page.locator('[data-lens-button="terrain"]').click()
      await expect(page.locator('#island-live')).toHaveText('Terrain view could not load.')
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
      await page.locator('[data-lens-button="terrain"]').click()
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'terrain', { timeout: 8000 })
      await expect(page.locator('canvas')).toHaveCount(1)
    })

    test('the intro plays on a first visit and Skip settles it', async ({ page }) => {
      await page.goto('/')
      const skip = page.locator('#intro-skip')
      await expect(skip).toBeVisible()
      await skip.click()
      await expect(skip).toBeHidden()
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
      await expect(page.locator('#stage')).not.toHaveAttribute('data-intro', /.*/)
      expect(await page.evaluate(() => sessionStorage.getItem('kp-intro-seen'))).toBe('1')
    })

    test('the provenance toggle shows sources and remembers the choice', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      const toggle = page.locator('#provenance-toggle')
      const firstSource = page.locator('#stage [data-claim-id] [data-claim-source]').first()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-provenance', 'on')
      expect(await firstSource.evaluate((item) => getComputedStyle(item).display)).not.toBe('none')
      await page.goto('/work/schedule-service/')
      await expect(page.locator('#provenance-toggle')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('main [data-claim-source]').first()).toBeVisible()
    })
  })
}
