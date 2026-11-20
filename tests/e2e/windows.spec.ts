import { expect, test } from '@playwright/test'

// Run by the windows-smoke CI job (npm run test:e2e -- --project=chromium --grep @windows). Consolas
// exists only on Windows, so this is the one place its size-adjusted fallback face is exercised.
test.describe('fonts and layout stability on the home page', { tag: '@windows' }, () => {
  test('web fonts load and page CLS stays under 0.02', async ({ page }) => {
    await page.addInitScript(() => {
      const record = { total: 0 }
      ;(window as unknown as { __cls: typeof record }).__cls = record
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) record.total += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await page.evaluate(() => document.fonts.ready)
    const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/"/g, '')))
    expect(loaded).toEqual(expect.arrayContaining(['Bricolage Grotesque', 'Newsreader', 'Martian Mono']))
    await page.waitForTimeout(300)
    const total = await page.evaluate(() => (window as unknown as { __cls: { total: number } }).__cls.total)
    expect(total).toBeLessThan(0.02)
  })
})
