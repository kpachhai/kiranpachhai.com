import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

// The cross-engine smoke subset: island core, the sheet and the provenance toggle, each at 390 and
// 1280 px. Firefox and WebKit run only tests tagged @smoke (static.spec.ts carries the same tag);
// Chromium runs these with everything else.
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

    test('island core: palette, readout, theme', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      await page.locator('#palette-open').click()
      await expect(page.locator('#palette')).toBeVisible()
      await expect(page.locator('#palette input')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.locator('#palette')).toBeHidden()

      const node = page.locator(`#sheet a.summit[data-summit="${firstDomain.id}"]`)
      await node.click()
      await expect(page.locator('#readout-h')).toHaveText(firstDomain.name)
      await page.keyboard.press('Escape')
      await expect(page.locator('#readout .ro-tree button[data-readout-area]')).toHaveCount(model.domains.length)
      await expect(node).toBeFocused()

      const theme = page.locator('#theme-toggle')
      await theme.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    })

    test('the sheet shows one drawing and every summit, with no horizontal scroll', async ({ page }) => {
      await skipIntro(page)
      await ready(page)
      const shown = await page
        .locator('.sheet-drawing svg[data-shape]')
        .evaluateAll((svgs) => svgs.filter((svg) => svg.checkVisibility()).map((svg) => svg.getAttribute('data-shape')))
      expect(shown).toEqual([viewport.width < 861 ? 'tall' : 'wide'])
      for (const domain of model.domains) await expect(page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)).toBeVisible()
      await expect(page.locator('[data-lens-button]')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
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
