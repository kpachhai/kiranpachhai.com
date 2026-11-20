import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

// axe with its full default rule set: every page, every lens on the home page, the interactive
// states (sources on, drawer open, palette open, the Range roles x hats view, and the phone
// toolkit expanded), both colour schemes, at 390 and 1280 px. Zero violations; no rule is disabled.
const LENSES = ['plan', 'terrain', 'console', 'index', 'range'] as const
const REDIRECTS = ['/about/', '/portfolio/', '/contact/']
const PAGES = [...model.caseStudies.map((study) => `/work/${study.slug}/`), '/404.html']

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

// Serve a redirect page without its meta refresh so the page itself is audited, not its target.
async function holdRedirect(page: Page, path: string) {
  await page.route(`**${path}`, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<meta http-equiv="refresh"[^>]*>/i, '')
    await route.fulfill({ response, body })
  })
}

async function homeReady(page: Page) {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan', { timeout: 8000 })
}

// Waits for an opening sheet or dialog to finish its transition, so axe reads its settled colours.
async function settled(page: Page, selector: string) {
  await expect
    .poll(() => page.locator(selector).evaluate((element) => element.getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length))
    .toBe(0)
}

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`axe at ${viewport.width} px, ${colorScheme}`, () => {
      test.use({ viewport, colorScheme })

      test('home page in every lens', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
        for (const lens of LENSES) {
          await page.locator(`[data-lens-button="${lens}"]`).click()
          await expect(page.locator('#stage')).toHaveAttribute('data-settled', lens, { timeout: 8000 })
          expect(await violations(page), lens).toEqual([])
        }
      })

      test('home page with sources on', async ({ page }) => {
        await homeReady(page)
        await page.locator('#provenance-toggle').click()
        await expect(page.locator('#provenance-toggle')).toHaveAttribute('aria-pressed', 'true')
        await expect(page.locator('[data-claim-source]:visible').first()).toBeVisible()
        expect(await violations(page)).toEqual([])
      })

      test('home page with the drawer open', async ({ page }) => {
        await homeReady(page)
        await page.locator(`#stage [data-node="${model.domains[0]!.id}"]`).click()
        await expect(page.locator('#drawer')).toBeVisible()
        await expect(page.locator('#drawer .dr-up')).toBeVisible()
        await settled(page, '#drawer')
        expect(await violations(page)).toEqual([])
      })

      test('home page with the palette open', async ({ page }) => {
        await homeReady(page)
        await page.keyboard.press('ControlOrMeta+k')
        await expect(page.locator('#palette')).toBeVisible()
        await expect(page.locator('#palette input')).toBeFocused()
        await settled(page, '#palette')
        expect(await violations(page)).toEqual([])
      })

      test('home page in the Range roles x hats view', async ({ page }) => {
        await homeReady(page)
        await page.locator('[data-lens-button="range"]').click()
        await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range', { timeout: 8000 })
        await page.locator('#stage .range-view button[data-range-view="roles"]').click()
        await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'roles')
        await expect(page.locator('#stage [data-hat-cell]').first()).toBeVisible()
        await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range', { timeout: 8000 })
        await settled(page, '#stage')
        expect(await violations(page)).toEqual([])
      })

      if (viewport.width === 390) {
        test('home page with the phone toolkit expanded', async ({ page }) => {
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await page.goto('/#journey')
          await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
          const toggle = page.locator('#journey .tk-toggle')
          await toggle.click()
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expect(page.locator('#tk-body')).toBeVisible()
          expect(await violations(page)).toEqual([])
        })
      }

      for (const path of PAGES) {
        test(`page ${path}`, async ({ page }) => {
          await page.goto(path)
          expect(await violations(page)).toEqual([])
        })
      }

      for (const path of REDIRECTS) {
        test(`moved page ${path}`, async ({ page }) => {
          await holdRedirect(page, path)
          await page.goto(path)
          expect(await violations(page)).toEqual([])
        })
      }
    })
  }
}
