import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

const lastRole = model.roles.at(-1)!
const hatCellCount = model.roles.reduce((sum, role) => sum + role.hats.length, 0)

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

const emptySlots = (page: Page) => page.locator('#journey .toolkit li[data-skill][data-state="empty"]').count()

// Text a visitor can see inside root, with its rendered size; hidden and screen-reader-only text is skipped.
function renderedTextSizes(root: Element): { text: string; size: number }[] {
  const clipped = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1 && getComputedStyle(node).overflow === 'hidden') return true
    }
    return false
  }
  const sizes: { text: string; size: number }[] = []
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
    }
    sizes.push({ text, size })
  }
  return sizes
}

test.describe('journey without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })

  test('renders every stop and the full toolkit', async ({ page }) => {
    await page.goto('/')
    const stops = page.locator('#journey .stop')
    await expect(stops).toHaveCount(model.roles.length)
    for (const role of model.roles) {
      const stop = page.locator(`#journey .stop[data-stop="${role.id}"]`)
      await expect(stop.locator('.stop-title'), role.id).toHaveText(role.title)
      await expect(stop.locator('.stop-years'), role.id).toHaveText(role.years)
      await expect(stop.locator('.chips li'), role.id).toHaveCount(role.skillsAdded.length)
      for (const item of role.work.items) await expect(stop, role.id).toContainText(item)
      for (const figure of role.figures) await expect(stop, role.id).toContainText(figure.text)
    }
    const toolkit = page.locator('#journey .toolkit')
    await expect(toolkit.locator('li[data-skill]')).toHaveCount(model.skills.length)
    for (const skill of model.skills) {
      const item = toolkit.locator(`li[data-skill="${skill.id}"]`)
      await expect(item, skill.id).toBeVisible()
      await expect(item, skill.id).toContainText(skill.name)
      await expect(item, skill.id).toContainText(`since ${skill.firstYear}`)
    }
    await expect(page.locator('#journey [data-state="empty"]')).toHaveCount(0)
  })

  test('links only the live career projects', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.locator('#journey .projects a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    for (const href of ['https://github.com/tuum-tech/assist-service', 'https://www.profile.site']) expect(hrefs).toContain(href)
    expect(hrefs.filter((href) => /develap|nucleus|noderators|Hive\.Node|material\.network/i.test(href ?? ''))).toEqual([])
    expect(await page.locator('body').innerText()).not.toMatch(/mtrl/i)
  })
})

test.describe('journey with JavaScript', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the toolkit fills as the stops scroll by and is complete at the last stop', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await expect.poll(() => emptySlots(page)).toBeGreaterThan(0)
    // An empty slot stays legible: full opacity, muted colour, dashed border.
    const empty = page.locator('#journey .toolkit li[data-state="empty"]').first()
    await expect(empty).toHaveCSS('opacity', '1')
    await expect(empty).toHaveCSS('border-top-style', 'dashed')
    const before = await emptySlots(page)
    await page.locator(`#journey .stop[data-stop="${model.roles[3].id}"]`).scrollIntoViewIfNeeded()
    await expect.poll(() => emptySlots(page)).toBeLessThan(before)
    await page.locator(`#journey .stop[data-stop="${lastRole.id}"]`).scrollIntoViewIfNeeded()
    await expect.poll(() => emptySlots(page), { timeout: 5000 }).toBe(0)
    await expect(page.locator('#journey .toolkit li[data-state="earned"]')).toHaveCount(model.skills.length)
    await expect(page.locator('#journey [data-tk-count]')).toContainText(`${model.skills.length} of ${model.skills.length}`)
    // Scrolling back up never empties the toolkit.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    expect(await emptySlots(page)).toBe(0)
  })

  test('reduced motion shows the complete toolkit and runs no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    expect(await emptySlots(page)).toBe(0)
    for (const role of model.roles) {
      await page.locator(`#journey .stop[data-stop="${role.id}"]`).scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.getAnimations().length), role.id).toBe(0)
    }
    expect(await emptySlots(page)).toBe(0)
    await expect(page.locator('#journey .toolkit li[data-skill]')).toHaveCount(model.skills.length)
    await expect(page.locator('.jy-fly')).toHaveCount(0)
  })
})

test.describe('range roles x hats toggle', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  const nodeRects = (page: Page) =>
    page.locator('#stage .node-box').evaluateAll((boxes) => boxes.map((box) => `${box.style.left},${box.style.top},${box.style.width}`))

  test('switches layouts by keyboard, keeps the choice for the session, and back', async ({ page }) => {
    await page.goto('/#lens-range')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    const areas = await nodeRects(page)
    const toRoles = page.locator('#stage .range-view button[data-range-view="roles"]')
    await expect(toRoles).toBeVisible()
    await expect(toRoles).toHaveAttribute('aria-pressed', 'false')
    await toRoles.focus()
    await page.keyboard.press('Enter')
    await expect(toRoles).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'roles')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    await expect(page.locator('#stage [data-hat-cell]')).toHaveCount(hatCellCount)
    await expect(page.locator('#stage [data-cell]')).toHaveCount(0)
    expect(await nodeRects(page)).not.toEqual(areas)
    expect(await page.evaluate(() => window.sessionStorage.getItem('kp-range-view'))).toBe('roles')

    await page.reload()
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'roles')
    await expect(page.locator('#stage [data-hat-cell]')).toHaveCount(hatCellCount)

    const toAreas = page.locator('#stage .range-view button[data-range-view="areas"]')
    await toAreas.focus()
    await page.keyboard.press('Space')
    await expect(toAreas).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'areas')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    await expect(page.locator('#stage [data-cell]')).toHaveCount(model.range.length)
    expect(await nodeRects(page)).toEqual(areas)
  })

  test('a fast double toggle leaves one decoration layer and no running animation', async ({ page }) => {
    await page.goto('/#lens-range')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    // Both presses land inside the 180 ms fade of the first.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#stage .range-view button[data-range-view="roles"]')!.click()
      document.querySelector<HTMLElement>('#stage .range-view button[data-range-view="areas"]')!.click()
    })
    await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'areas')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation)).length))
      .toBe(0)
    await expect(page.locator('#stage svg [data-deco]')).toHaveCount(1)
    await expect(page.locator('#stage [data-hat-cell]')).toHaveCount(0)
    await expect(page.locator('#stage [data-cell]')).toHaveCount(model.range.length)
    await expect(page.locator('#island-live')).toHaveText('Range: areas x modes')

    await page.evaluate(() => {
      for (const view of ['roles', 'areas', 'roles']) document.querySelector<HTMLElement>(`#stage .range-view button[data-range-view="${view}"]`)!.click()
    })
    await expect(page.locator('#stage')).toHaveAttribute('data-range-view', 'roles')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation)).length))
      .toBe(0)
    await expect(page.locator('#stage svg [data-deco]')).toHaveCount(1)
    await expect(page.locator('#stage [data-cell]')).toHaveCount(0)
    await expect(page.locator('#stage [data-hat-cell]')).toHaveCount(hatCellCount)
    await expect(page.locator('#island-live')).toHaveText('Range: roles x hats. Each Journey stop lists its hats.')
  })

  test('names the hat columns as the Journey does', async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem('kp-range-view', 'roles'))
    await page.goto('/#lens-range')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
    const heads = await page.locator('#stage .range-hat-head:not(.corner)').allTextContents()
    expect(heads.map((text) => text.trim())).toEqual(model.hats.map((hat) => hat.name))
  })

  test('the Plan hub counts primary languages, as the hero and BOM do', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
    const primary = model.materials.filter((material) => material.band === 'language').length
    await expect(page.locator('#stage svg')).toContainText(`${primary} PRIMARY LANGUAGES /`)
  })

  test('shows only in the Range lens', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'plan')
    await expect(page.locator('#stage .range-view')).toBeHidden()
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`journey at 390 px, ${colorScheme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme })

    test('the toolkit body is collapsed from first paint on a deep link', async ({ page }) => {
      await page.addInitScript(() => {
        const look = () => {
          const body = document.getElementById('tk-body')
          if (!body) return requestAnimationFrame(look)
          ;(window as unknown as { firstBody: string }).firstBody = getComputedStyle(body).display
        }
        requestAnimationFrame(look)
      })
      await page.goto('/#journey')
      await expect.poll(() => page.evaluate(() => (window as unknown as { firstBody?: string }).firstBody)).toBe('none')
      await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
      await expect(page.locator('#tk-body')).toBeHidden()
      await expect(page.locator('#journey .tk-toggle')).toHaveAttribute('aria-expanded', 'false')
    })

    test('no horizontal scroll and no visible text under 10 px', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
      for (const role of model.roles) {
        await page.locator(`#journey .stop[data-stop="${role.id}"]`).scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth), role.id).toBe(390)
      }
      await expect.poll(() => emptySlots(page), { timeout: 5000 }).toBe(0)
      const toggle = page.locator('#journey .tk-toggle')
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const sizes = await page.locator('#journey').evaluate(renderedTextSizes)
      expect(sizes.length).toBeGreaterThan(50)
      expect(sizes.filter((item) => item.size < 10)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    })

    test('the roles x hats view keeps stage text at 10 px or more', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript(() => window.sessionStorage.setItem('kp-range-view', 'roles'))
      await page.goto('/#lens-range')
      await expect(page.locator('#stage')).toHaveAttribute('data-settled', 'range')
      await expect(page.locator('#stage [data-hat-cell]')).toHaveCount(hatCellCount)
      const sizes = await page.locator('#stage').evaluate(renderedTextSizes)
      expect(sizes.length).toBeGreaterThan(5)
      expect(sizes.filter((item) => item.size < 10)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    })
  })
}
