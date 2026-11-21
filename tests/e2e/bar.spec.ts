import { expect, test, type Page } from '@playwright/test'

// The sticky bar: one row from 720 px up.
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

// Visible children of the bar, by top and bottom edge.
const barItems = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.bar-in > *')]
      .map((element) => ({ name: element.className || element.id || element.tagName, rect: element.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .map((item) => ({ name: item.name, top: Math.round(item.rect.top), bottom: Math.round(item.rect.bottom) })),
  )

for (const width of [720, 800, 900, 1023, 1024, 1280]) {
  test(`the bar sits on one row at ${width} px`, { tag: '@smoke' }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    const items = await barItems(page)
    // Mark, search, sources and theme.
    expect(items.length).toBe(4)
    const firstBottom = Math.min(...items.map((item) => item.bottom))
    for (const item of items) expect(item.top, item.name).toBeLessThan(firstBottom)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

// The footer's settings stay hidden where the bar has the theme control, so exactly one shows.
for (const width of [720, 900, 1024]) {
  test(`one theme control is visible at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    const visible = (selector: string) =>
      page.locator(selector).evaluateAll((items) => items.filter((item) => item.checkVisibility()).map((item) => item.textContent?.trim()))
    expect(await visible('[data-theme-control]')).toEqual(['Theme: system'])
  })
}
