import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

const SLUGS = model.caseStudies.map((study) => study.slug)
const CASE_PAGES = SLUGS.map((slug) => `/work/${slug}/`)
const PAGES = ['/', ...CASE_PAGES]
const SOURCE = '[data-claim-source]'

// The intro and the role cycle are not under test here; skip them so the page settles at once.
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

// Displayed: the toggle has not hidden it (it may still sit in a list kept for screen readers only).
async function displayedSources(page: Page): Promise<number> {
  return page.locator(SOURCE).evaluateAll((items) => items.filter((item) => getComputedStyle(item).display !== 'none').length)
}

async function visibleSources(page: Page): Promise<number> {
  return page.locator(SOURCE).evaluateAll((items) => items.filter((item) => item.checkVisibility({ visibilityProperty: true })).length)
}

async function turnOn(page: Page) {
  const toggle = page.locator('#provenance-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

test.describe('provenance toggle', () => {
  for (const path of PAGES) {
    test(`${path}: every claim has one source, shown only while the toggle is on`, async ({ page }) => {
      await page.goto(path)
      const claims = page.locator('[data-claim-id]')
      expect(await claims.count()).toBeGreaterThan(0)
      const perClaim = await claims.evaluateAll((items, selector) => items.map((item) => item.querySelectorAll(selector).length), SOURCE)
      expect(perClaim.every((count) => count === 1)).toBe(true)
      const ids = await claims.evaluateAll((items) => items.map((item) => item.getAttribute('data-claim-id')))
      expect(new Set(ids).size).toBe(ids.length)
      expect(await displayedSources(page)).toBe(0)

      await turnOn(page)
      expect(await displayedSources(page)).toBe(await page.locator(SOURCE).count())
      expect(await visibleSources(page)).toBeGreaterThan(0)

      await page.locator('#provenance-toggle').click()
      await expect(page.locator('#provenance-toggle')).toHaveAttribute('aria-pressed', 'false')
      expect(await displayedSources(page)).toBe(0)
    })
  }

  test('home: every proof and material carries its source, and the drawer and the BOM show it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    for (const proof of model.proofs) await expect(page.locator(`[data-claim-id="proof-${proof.id}"] ${SOURCE}`), proof.id).toHaveCount(1)
    for (const material of model.materials) await expect(page.locator(`[data-claim-id="material-${material.id}"] ${SOURCE}`), material.id).toHaveCount(1)
    await turnOn(page)
    await expect(page.locator('#provenance-note')).toBeVisible()
    await expect(page.locator('#provenance-note')).toHaveText('Range cells and ledger rows link to their source.')

    // Plan lens: the bill of materials shows each row's source.
    for (const material of model.materials) await expect(page.locator(`[data-claim-id="material-${material.id}"] ${SOURCE}`), material.id).toBeVisible()

    // The drawer shows each proof's source for a domain, and the material's own source.
    const domain = model.domains[0]
    const node = page.locator(`#stage [data-node="${domain.id}"]`)
    await node.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#drawer')).toBeVisible()
    const domainProofs = model.proofs.filter((proof) => proof.domainId === domain.id)
    for (const proof of domainProofs) await expect(page.locator(`#drawer [data-claim-id="drawer-proof-${proof.id}"] ${SOURCE}`), proof.id).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#drawer')).toBeHidden()

    const material = model.materials[0]
    await page.locator(`[data-material-open="${material.id}"]`).click()
    await expect(page.locator(`#drawer [data-claim-id="drawer-material-${material.id}"] ${SOURCE}`)).toBeVisible()
  })

  test('labels read as URL text, LinkedIn, or Owner with a date and no link', async ({ page }) => {
    await page.goto('/')
    await turnOn(page)
    const labels = await page.locator(SOURCE).evaluateAll((items) =>
      items.map((item) => ({
        kind: item.getAttribute('data-source-kind'),
        text: item.textContent?.trim() ?? '',
        href: item.querySelector('a')?.getAttribute('href') ?? null,
      })),
    )
    const kinds = new Set(labels.map((label) => label.kind))
    expect([...kinds].sort()).toEqual(['linkedin', 'owner', 'url'])
    for (const label of labels) {
      if (label.kind === 'owner') {
        expect(label.text).toMatch(/^Owner, \d{4}-\d{2}-\d{2}$/)
        expect(label.href).toBeNull()
      } else if (label.kind === 'linkedin') {
        expect(label.text).toBe('LinkedIn')
      } else {
        expect(label.href).toMatch(/^https:\/\//)
        // The label shows the path only; a query (the GitHub search behind a count) stays in the link.
        const lastSegment = new URL(label.href!).pathname.replace(/\/$/, '').split('/').pop()!
        expect(label.text.startsWith(new URL(label.href!).host)).toBe(true)
        // The part of a segment that would show an employer, a hedge word or a HIP number is elided:
        // each ellipsis in the shown last segment stands for some text of the real one.
        const shownLast = label.text.split('/').pop()!
        const escaped = shownLast.split('…').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        expect(lastSegment).toMatch(new RegExp(`^${escaped.join('.+')}$`))
        expect(label.text).not.toMatch(/hip-?\d/i)
      }
    }
  })

  test('a case study cites its url sources and owner sources', async ({ page }) => {
    await page.goto('/work/schedule-service/')
    await turnOn(page)
    const problem = page.locator('[data-claim-id="case-schedule-service-problem"] [data-claim-source]')
    await expect(problem).toHaveAttribute('data-source-kind', 'url')
    await expect(problem.locator('a')).toHaveAttribute('href', model.caseStudies[0].problem.source.kind === 'url' ? model.caseStudies[0].problem.source.url : '')

    await page.goto('/work/hip-explorer-agent/')
    const owner = page.locator('[data-claim-id="case-hip-explorer-agent-approach"] [data-claim-source]')
    await expect(owner).toHaveText('Owner, 2026-11-19')
    await expect(owner.locator('a')).toHaveCount(0)
  })

  test('the choice survives a reload and carries to other pages', async ({ page }) => {
    await page.goto('/')
    await turnOn(page)
    await page.reload()
    await expect(page.locator('#provenance-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(await visibleSources(page)).toBeGreaterThan(0)
    await page.goto('/work/plumbing-of-money/')
    await expect(page.locator('#provenance-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(await visibleSources(page)).toBe(await page.locator('[data-claim-id]').count())
  })

  test('works when storage throws', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage blocked')
        },
      })
    })
    await page.goto('/work/signscope-snap/')
    await turnOn(page)
    expect(await visibleSources(page)).toBe(await page.locator('[data-claim-id]').count())
  })

  test.describe('at 390 px with sources on', () => {
    test.use({ viewport: { width: 390, height: 844 } })
    for (const path of PAGES) {
      test(`${path} has no horizontal scroll`, async ({ page }) => {
        await page.goto(path)
        await turnOn(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
      })
    }
  })
})

test.describe('case-study diagrams', () => {
  for (const slug of SLUGS) {
    test(`${slug} has one diagram with an accessible name`, async ({ page }) => {
      await page.goto(`/work/${slug}/`)
      const diagram = page.locator('figure.dg [role="img"]:visible')
      await expect(diagram).toHaveCount(1)
      await expect(diagram).toHaveAccessibleName(/\S.{20,}/)
      expect(await diagram.getAttribute('data-diagram')).toBe(slug)
    })
  }

  test('a diagram draws in when it enters the viewport and settles visible', async ({ page }) => {
    await page.goto('/work/cross-ledger-explorer/')
    const figure = page.locator('figure.dg')
    await figure.scrollIntoViewIfNeeded()
    await expect(figure).toHaveClass(/\bin\b/)
    // The draw-in starts: some node of the shown drawing is animating.
    await expect
      .poll(() => figure.locator('svg:visible .nd').evaluateAll((nodes) => nodes.some((node) => node.getAnimations().length > 0)), { timeout: 2000 })
      .toBe(true)
    // And settles: nothing runs, and every node of the shown drawing is fully visible.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length), { timeout: 5000 }).toBe(0)
    const opacities = await figure.locator('svg:visible .nd').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity))
    expect(opacities.length).toBeGreaterThan(2)
    expect(opacities.every((value) => value === '1')).toBe(true)
  })

  test('the case-study page adopts the lens chosen on the home page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await page.locator('[data-lens-button="console"]').click()
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'console')
    await page.goto('/work/schedule-service/')
    await expect(page.locator('html')).toHaveAttribute('data-lens', 'console')
    const font = await page.locator('figure.dg text').first().evaluate((node) => getComputedStyle(node).fontFamily)
    expect(font).toContain('Martian Mono')
  })

  test('without a chosen lens the diagram uses the plan lens', async ({ page }) => {
    await page.goto('/work/schedule-service/')
    const font = await page.locator('figure.dg text').first().evaluate((node) => getComputedStyle(node).fontFamily)
    expect(font).toContain('Bricolage Grotesque')
  })

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })
    for (const slug of SLUGS) {
      test(`${slug} runs no animations and shows the settled diagram`, async ({ page }) => {
        await page.goto(`/work/${slug}/`)
        await page.locator('figure.dg').scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)
        expect(running).toBe(0)
        const opacities = await page.locator('figure.dg .nd').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity))
        expect(opacities.every((value) => value === '1')).toBe(true)
      })
    }
  })
})

// Rendered text size: the computed font size, times the drawing's scale for SVG text. Text hidden
// from view (display, visibility, opacity, or a 1 px clip kept for screen readers) is skipped.
function renderedTextSizes(root: Element): { text: string; size: number; secondLine: boolean }[] {
  const clipped = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1 && getComputedStyle(node).overflow === 'hidden') return true
    }
    return false
  }
  const sizes: { text: string; size: number; secondLine: boolean }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement
    const text = node.textContent?.trim() ?? ''
    if (!element || !text) continue
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || clipped(element)) continue
    let size = parseFloat(getComputedStyle(element).fontSize)
    if (element instanceof SVGGraphicsElement) {
      const matrix = element.getScreenCTM()
      if (matrix) size *= Math.hypot(matrix.a, matrix.b)
    } else {
      // HTML text shrinks with every CSS transform and scale above it.
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.transform !== 'none') {
          const matrix = new DOMMatrix(style.transform)
          size *= Math.hypot(matrix.a, matrix.b)
        }
        if (style.scale !== 'none') size *= parseFloat(style.scale)
      }
    }
    sizes.push({ text, size, secondLine: element.classList.contains('sm') })
  }
  return sizes
}

test.describe('text at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const LENSES = ['plan', 'terrain', 'console', 'index', 'range']
  const small = (sizes: { text: string; size: number }[]) => sizes.filter((item) => item.size < 10)

  test('counts a CSS transform scale in the size of HTML text', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'font-size: 16px; transform: scale(0.5)'
      probe.innerHTML = '<span style="scale: 0.5">tiny</span>'
      document.body.append(probe)
    })
    const sizes = await page.locator('body').evaluate(renderedTextSizes)
    expect(sizes.find((item) => item.text === 'tiny')?.size).toBe(4)
  })

  test('the bar, with sources on, is at least 10 px', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await turnOn(page)
    const sizes = await page.locator('header.bar').evaluate(renderedTextSizes)
    expect(sizes.length).toBeGreaterThan(3)
    expect(small(sizes)).toEqual([])
  })

  test('the drawer, with sources on, is at least 10 px', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await turnOn(page)
    for (const domain of model.domains) {
      await page.locator(`#stage [data-node="${domain.id}"]`).click()
      await expect(page.locator('#drawer')).toBeVisible()
      const sizes = await page.locator('#drawer').evaluate(renderedTextSizes)
      expect(sizes.some((item) => item.text.length > 0), domain.id).toBe(true)
      expect(small(sizes), domain.id).toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.locator('#drawer')).toBeHidden()
    }
  })

  test('the home page body, with sources on, is at least 10 px', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await turnOn(page)
    expect(small(await page.locator('main').evaluate(renderedTextSizes))).toEqual([])
  })

  for (const slug of SLUGS) {
    test(`the ${slug} case page body, with sources on, is at least 10 px`, async ({ page }) => {
      await page.goto(`/work/${slug}/`)
      await turnOn(page)
      const sizes = await page.locator('main').evaluate(renderedTextSizes)
      expect(sizes.length).toBeGreaterThan(10)
      expect(small(sizes)).toEqual([])
    })
  }

  for (const lens of LENSES) {
    test(`stage text in the ${lens} lens is at least 10 px`, async ({ page }) => {
      await page.goto(`/#lens-${lens}`)
      await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
      await expect(page.locator('#stage')).toHaveAttribute('data-lens', lens)
      const sizes = await page.locator('#stage').evaluate(renderedTextSizes)
      expect(sizes.length).toBeGreaterThan(5)
      expect(sizes.filter((item) => item.size < 10)).toEqual([])
    })

    test(`diagram text in the ${lens} lens: labels at least 11 px, second lines at least 10 px`, async ({ page }) => {
      await page.addInitScript((chosen) => window.sessionStorage.setItem('kp-lens', chosen), lens)
      for (const slug of SLUGS) {
        await page.goto(`/work/${slug}/`)
        const sizes = await page.locator('figure.dg').evaluate(renderedTextSizes)
        expect(sizes.length, slug).toBeGreaterThan(4)
        expect(sizes.filter((item) => item.size < (item.secondLine ? 10 : 11)), slug).toEqual([])
      }
    })
  }
})

test.describe('case-study images', () => {
  test('The Plumbing of Money shows widget screenshots with alt text', async ({ page }) => {
    await page.goto('/work/plumbing-of-money/')
    const images = page.locator('main img')
    const count = await images.count()
    expect(count).toBeGreaterThanOrEqual(2)
    expect(count).toBeLessThanOrEqual(3)
    for (const alt of await images.evaluateAll((items) => items.map((item) => item.getAttribute('alt') ?? ''))) {
      expect(alt.length).toBeGreaterThan(20)
    }
    // Each screenshot links to its full-width variant on this site.
    const targets = await page.locator('main a.shot').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    expect(targets).toHaveLength(count)
    expect(targets.every((href) => href.startsWith('/_astro/') && href.endsWith('.webp'))).toBe(true)
    // The screenshots are served from this site, and the page links to no course host.
    const sources = await images.evaluateAll((items) => items.map((item) => item.getAttribute('src') ?? ''))
    expect(sources.every((src) => src.startsWith('/_astro/'))).toBe(true)
    const hosts = await page.locator('a[href^="http"]').evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).host))
    expect(hosts.filter((host) => /money/i.test(host))).toEqual([])
  })
})
