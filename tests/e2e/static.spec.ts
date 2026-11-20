import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

test.use({ javaScriptEnabled: false })

const SLUGS = [
  'schedule-service',
  'signscope-snap',
  'hip-explorer-agent',
  'cross-ledger-explorer',
  'plumbing-of-money',
  'onchain-finance-template',
]
const REDIRECTS: [string, string][] = [
  ['/about/', '/#timeline'],
  ['/portfolio/', '/#work'],
  ['/contact/', '/'],
]
const SECTIONS = ['work', 'methods', 'range', 'timeline', 'upstream', 'talks']

// Serve a redirect page without its meta refresh so the page itself can be inspected.
async function holdRedirect(page: Page, path: string) {
  await page.route(`**${path}`, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<meta http-equiv="refresh"[^>]*>/i, '')
    await route.fulfill({ response, body })
  })
}

test.describe('home page without JavaScript', () => {
  test('shows the six domains in the static hero', async ({ page }) => {
    await page.goto('/')
    const stage = page.locator('#stage')
    await expect(stage).toBeVisible()
    const domains = stage.locator('[data-domain]')
    await expect(domains).toHaveCount(6)
    const ids = await domains.evaluateAll((items) => items.map((item) => item.getAttribute('data-domain')))
    expect(ids).toEqual(model.domains.map((domain) => domain.id))
  })

  test('shows every proof label from the model', async ({ page }) => {
    await page.goto('/')
    const text = await page.locator('#stage').innerText()
    for (const proof of model.proofs) expect(text, proof.id).toContain(proof.label)
  })

  test('has every section anchor', async ({ page }) => {
    await page.goto('/')
    for (const id of SECTIONS) await expect(page.locator(`section#${id}`), id).toHaveCount(1)
  })

  test('shows the upstream counts with their date', async ({ page }) => {
    await page.goto('/')
    const upstream = page.locator('#upstream')
    await expect(upstream.locator('[data-count]')).toHaveCount(4)
    await expect(upstream).toContainText(/as of \d{4}-\d{2}-\d{2}/)
  })

  test('renders the range matrix as a table with headers', async ({ page }) => {
    await page.goto('/')
    const table = page.locator('#range table')
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(model.modes.length + 1)
    await expect(table.locator('tbody th[scope="row"]')).toHaveCount(model.domains.length)
  })

  test('links every case study from selected work', async ({ page }) => {
    await page.goto('/')
    for (const slug of SLUGS) await expect(page.locator(`#work a[href="/work/${slug}/"]`), slug).toHaveCount(1)
  })
})

test.describe('case-study pages', () => {
  for (const slug of SLUGS) {
    test(`${slug} has problem, approach, methods and outcome`, async ({ page }) => {
      const response = await page.goto(`/work/${slug}/`)
      expect(response?.status()).toBe(200)
      for (const heading of ['Problem', 'Approach', 'Methods', 'Outcome']) {
        await expect(page.getByRole('heading', { level: 2, name: heading, exact: true }), heading).toBeVisible()
      }
    })
  }
})

test.describe('old URLs', () => {
  for (const [path, target] of REDIRECTS) {
    test(`${path} refreshes to ${target} and links to it`, async ({ page, request }) => {
      const html = await (await request.get(path)).text()
      expect(html).toMatch(new RegExp(`<meta http-equiv="refresh" content="0; url=${target.replace('#', '\\#')}"`))
      await holdRedirect(page, path)
      await page.goto(path)
      await expect(page.locator(`main a[href="${target}"]`)).toBeVisible()
    })
  }

  test('unknown paths get the designed 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page/')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main a[href="/"]')).toBeVisible()
  })
})

test.describe('every page at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  const pages = ['/', ...SLUGS.map((slug) => `/work/${slug}/`), ...REDIRECTS.map(([path]) => path), '/404.html']

  for (const path of pages) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      if (REDIRECTS.some(([redirect]) => redirect === path)) await holdRedirect(page, path)
      await page.goto(path)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    })

    test(`${path} footer links only to GitHub and LinkedIn`, async ({ page }) => {
      if (REDIRECTS.some(([redirect]) => redirect === path)) await holdRedirect(page, path)
      await page.goto(path)
      const links = page.locator('footer a')
      await expect(links).toHaveCount(2)
      expect(await links.evaluateAll((items) => items.map((item) => [item.textContent?.trim(), item.getAttribute('href')]))).toEqual([
        ['GitHub', 'https://github.com/kpachhai'],
        ['LinkedIn', 'https://www.linkedin.com/in/kiranpachhai'],
      ])
    })
  }
})
