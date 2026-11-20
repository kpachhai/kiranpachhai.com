import { expect, test, type Page } from '@playwright/test'

// The sticky bar: one row from 720 px up; at 390 the lens switcher takes its own second row.
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
    // Mark, lenses, search, sources and theme everywhere; the shortcuts switch too from 1024 px.
    expect(items.length).toBe(width < 1024 ? 5 : 6)
    const firstBottom = Math.min(...items.map((item) => item.bottom))
    for (const item of items) expect(item.top, item.name).toBeLessThan(firstBottom)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

// Where the bar drops the shortcuts switch for room, the footer shows it, so one of each stays visible.
for (const width of [720, 900, 1024]) {
  test(`one theme control and one shortcuts switch are visible at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    const visible = (selector: string) =>
      page.locator(selector).evaluateAll((items) => items.filter((item) => item.checkVisibility()).map((item) => item.textContent?.trim()))
    expect(await visible('[data-theme-control]')).toEqual(['Theme: system'])
    expect(await visible('[data-shortcuts-control]')).toEqual(['Keyboard shortcuts'])
  })
}

test('at 390 px the lens switcher takes its own second row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  const items = await barItems(page)
  const lenses = items.find((item) => item.name === 'lenses')!
  const others = items.filter((item) => item.name !== 'lenses')
  for (const item of others) expect(lenses.top, item.name).toBeGreaterThanOrEqual(item.bottom)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
