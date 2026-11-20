import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'
import { upstreamIn } from '../../src/lib/site'

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
const SECTIONS = ['work', 'methods', 'journey', 'range', 'timeline', 'upstream', 'talks']

// Serve a redirect page without its meta refresh so the page itself can be inspected.
async function holdRedirect(page: Page, path: string) {
  await page.route(`**${path}`, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<meta http-equiv="refresh"[^>]*>/i, '')
    await route.fulfill({ response, body })
  })
}

test.describe('home page without JavaScript', { tag: '@smoke' }, () => {
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

  test('lists every upstream row and pinned link under its area', async ({ page }) => {
    await page.goto('/')
    for (const domain of model.domains) {
      const expected = upstreamIn(domain.id).flatMap((row) => [{ href: row.href, text: row.label }, ...row.links.map((link) => ({ href: link.href, text: link.note }))])
      const links = page.locator(`#stage [data-domain="${domain.id}"] [data-upstream] a`)
      await expect(links, domain.id).toHaveCount(expected.length)
      for (const [position, item] of expected.entries()) {
        await expect(links.nth(position)).toHaveAttribute('href', item.href)
        await expect(links.nth(position)).toHaveText(item.text)
        await expect(links.nth(position)).toBeVisible()
      }
    }
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

test.describe('case-study pages', { tag: '@smoke' }, () => {
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

test.describe('old URLs', { tag: '@smoke' }, () => {
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

test.describe('every page at 390 px', { tag: '@smoke' }, () => {
  test.use({ viewport: { width: 390, height: 844 } })
  const pages = ['/', ...SLUGS.map((slug) => `/work/${slug}/`), ...REDIRECTS.map(([path]) => path), '/404.html']

  for (const path of pages) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      if (REDIRECTS.some(([redirect]) => redirect === path)) await holdRedirect(page, path)
      await page.goto(path)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    })

    test(`${path} has no horizontal scroll with the root font at 200%`, async ({ page }) => {
      if (REDIRECTS.some(([redirect]) => redirect === path)) await holdRedirect(page, path)
      await page.goto(path)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    })

    test(`${path} footer links only to GitHub, LinkedIn, YouTube and X`, async ({ page }) => {
      if (REDIRECTS.some(([redirect]) => redirect === path)) await holdRedirect(page, path)
      await page.goto(path)
      const links = page.locator('footer a')
      await expect(links).toHaveCount(4)
      expect(await links.evaluateAll((items) => items.map((item) => [item.textContent?.trim(), item.getAttribute('href')]))).toEqual([
        ['GitHub', 'https://github.com/kpachhai'],
        ['LinkedIn', 'https://www.linkedin.com/in/kiranpachhai'],
        ['YouTube', 'https://www.youtube.com/channel/UCu1XxDJE84ZvgLJ-EssbveA'],
        ['X', 'https://twitter.com/mr_pachhai'],
      ])
    })
  }
})
