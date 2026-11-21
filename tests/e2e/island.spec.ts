import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'
import { upstreamIn } from '../../src/lib/site'

const teachProofIds = new Set(model.range.filter((cell) => cell.mode === 'teach').flatMap((cell) => cell.proofIds))
const teachLabels = model.proofs.filter((proof) => teachProofIds.has(proof.id)).map((proof) => proof.label)
const firstDomain = model.domains[0]

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

async function ready(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
}

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('#palette')).toBeVisible()
  await expect(page.locator('#palette input')).toBeFocused()
}

async function runPalette(page: Page, query: string) {
  await openPalette(page)
  await page.locator('#palette input').fill(query)
  await page.keyboard.press('Enter')
}

async function openAreaFromSummit(page: Page, domainId: string) {
  const summit = page.locator(`#sheet a.summit[data-summit="${domainId}"]`)
  await summit.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#readout-h')).toHaveText(model.domains.find((domain) => domain.id === domainId)!.name)
  return summit
}

test.describe('theme', () => {
  test.use({ colorScheme: 'light' })

  test('a chosen dark theme survives reload before the island runs', async ({ page }) => {
    await ready(page)
    await runPalette(page, 'theme: dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // Block every bundled script: only the inline pre-paint script can set the theme now.
    await page.route('**/_astro/*.js', (route) => route.abort())
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).not.toHaveAttribute('data-island', 'ready')
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(ground).toBe('rgb(15, 17, 18)')
  })

  test('when the island code cannot load, the page shows its no-JS view with no dead controls', async ({ page }) => {
    await page.route('**/_astro/*.js', (route) => route.abort())
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/)
    await expect(page.locator('header.bar')).toBeHidden()
    await expect(page.locator('footer [data-theme-control]')).toBeHidden()
    await expect(page.locator('#stage [data-domain]').first()).toBeVisible()
    await expect(page.locator('#stage .proofs').first()).toBeVisible()
  })

  test('the theme control cycles system, light, dark', async ({ page }) => {
    await ready(page)
    const control = page.locator('#theme-toggle')
    await expect(control).toHaveText('Theme: system')
    await control.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await control.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await control.click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
    await expect(control).toHaveText('Theme: system')
  })

  test('with storage throwing, the page renders in the system theme', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError')
        },
      })
    })
    await ready(page)
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
    await expect(page.locator('#stage')).toBeVisible()
    await page.locator('#theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(errors).toEqual([])
  })
})

test.describe('theme control', () => {
  test('the home page has one theme control, named as everywhere else', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    const visible = (selector: string) =>
      page.locator(selector).evaluateAll((items) => items.filter((item) => item.checkVisibility()).map((item) => item.textContent?.trim()))
    expect(await visible('[data-theme-control]')).toEqual(['Theme: system'])
  })

  test('the palette has no keyboard shortcuts setting', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.locator('#palette input').fill('keyboard shortcuts')
    await expect(page.locator('#palette [role="option"]')).toHaveCount(0)
  })
})

test.describe('palette', () => {
  test('Ctrl+Shift+K leaves the palette closed; Ctrl with the K key on a non-Latin layout opens it', async ({ page }) => {
    await ready(page)
    await page.keyboard.press('ControlOrMeta+Shift+k')
    await expect(page.locator('#palette')).toBeHidden()
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '\u043b', code: 'KeyK', ctrlKey: true, bubbles: true })))
    await expect(page.locator('#palette')).toBeVisible()
  })

  test('a press on the palette footer keeps focus in the input, so Esc still closes it', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await expect(page.locator('#palette input')).toHaveAttribute('placeholder', 'Search domains, proofs, methods, materials')
    await page.locator('#palette .pal-foot').click()
    await expect(page.locator('#palette input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('#palette')).toBeHidden()
  })

  test('the visible button shows a plain-text shortcut hint', async ({ page }) => {
    await ready(page)
    const hint = page.locator('#palette-open .hint')
    await expect(hint).toHaveText(/^(Ctrl|Cmd) K$/)
    expect(await page.locator('#palette-open').innerText()).not.toContain('\u2318')
    await page.locator('#palette-open').click()
    await expect(page.locator('#palette')).toBeVisible()
  })

  test('mode: teach lists only Teach-mode proofs', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.locator('#palette input').fill('mode: teach')
    const options = page.locator('#palette [role="option"][data-kind]')
    await expect(options).toHaveCount(teachLabels.length)
    expect(await options.evaluateAll((items) => items.map((item) => item.getAttribute('data-kind')))).toEqual(
      teachLabels.map(() => 'proof'),
    )
    expect((await options.locator('.label').allInnerTexts()).sort()).toEqual([...teachLabels].sort())
  })

  test('lists domains, proofs, methods, materials, modes and theme', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    const kinds = await page
      .locator('#palette [role="option"][data-kind]')
      .evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute('data-kind')))])
    expect(kinds.sort()).toEqual(['domain', 'material', 'method', 'mode', 'proof', 'theme'])
  })

  test('arrow keys move the selection and Enter acts', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.locator('#palette input').fill('theme: ')
    const selected = page.locator('#palette [aria-selected="true"]')
    await expect(selected).toContainText('theme: system')
    await page.keyboard.press('ArrowDown')
    await expect(selected).toContainText('theme: light')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await expect(selected).toContainText('theme: light')
    await page.keyboard.press('Enter')
    await expect(page.locator('#palette')).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('Esc closes the palette and returns focus to the opener', async ({ page }) => {
    await ready(page)
    await page.locator('#palette-open').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#palette input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('#palette')).toBeHidden()
    await expect(page.locator('#palette-open')).toBeFocused()
  })

  test('kp commands open a domain, and lens commands are gone', async ({ page }) => {
    await ready(page)
    await runPalette(page, `kp ${firstDomain.id}`)
    await expect(page.locator('#readout-h')).toHaveText(firstDomain.name)
    await page.keyboard.press('Escape')
    await openPalette(page)
    await page.locator('#palette input').fill('kp terrain')
    await expect(page.locator('#palette [role="option"]')).toHaveCount(0)
    await page.locator('#palette input').fill('lens: ')
    await expect(page.locator('#palette [role="option"]')).toHaveCount(0)
  })

  test('a material shows in the readout with the domains and proofs that use it', async ({ page }) => {
    await ready(page)
    const material = model.materials.find((item) => item.id === 'solidity')!
    await runPalette(page, `material: ${material.name}`)
    await expect(page.locator('#readout-h')).toHaveText(material.name)
    const readoutText = await page.locator('#readout').innerText()
    for (const proofId of material.usedIn) {
      const proof = model.proofs.find((item) => item.id === proofId)!
      expect(readoutText).toContain(proof.label)
      expect(readoutText).toContain(model.domains.find((domain) => domain.id === proof.domainId)!.name)
    }
  })
})

test.describe('fonts', () => {
  test('the thesis uses the real italic face, it never shifts as fonts arrive, and page CLS stays under 0.02', async ({ page }) => {
    await page.addInitScript(() => {
      const record = { thesis: [] as number[], total: 0 }
      ;(window as unknown as { __shifts: typeof record }).__shifts = record
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
          if (entry.hadRecentInput) continue
          record.total += entry.value
          const moved = (entry.sources ?? []).some((source) => {
            const node = source.node instanceof Element ? source.node : source.node?.parentElement
            return Boolean(node?.closest('.thesis'))
          })
          if (moved) record.thesis.push(entry.value)
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await ready(page)
    await page.evaluate(() => document.fonts.ready)
    const italic = await page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'Newsreader' && face.style === 'italic' && face.status === 'loaded'))
    expect(italic).toBe(true)
    expect(await page.locator('.thesis').evaluate((thesis) => getComputedStyle(thesis).fontStyle)).toBe('italic')
    // The headline face is the condensed cut.
    expect(await page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'Bricolage Grotesque' && face.stretch === '82%' && face.status === 'loaded'))).toBe(true)
    await page.waitForTimeout(300)
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: { thesis: number[]; total: number } }).__shifts)
    expect(shifts.thesis).toEqual([])
    expect(shifts.total).toBeLessThan(0.02)
  })
})

test.describe('settings on every page', { tag: '@smoke' }, () => {
  for (const path of ['/work/schedule-service/', '/404.html']) {
    test(`${path} has the theme control`, async ({ page }) => {
      await page.goto(path)
      const theme = page.locator('footer [data-theme-control]')
      await expect(theme).toHaveText('Theme: system')
      await theme.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(theme).toHaveText('Theme: light')
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    })
  }

  test('on a phone the footer keeps the theme control', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/work/schedule-service/')
    await expect(page.locator('footer [data-theme-control]')).toBeVisible()
  })
})

test.describe('palette method entries', () => {
  for (const method of model.methods) {
    test(`${method.id} ${method.name} scrolls to its own place in How I work`, async ({ page }) => {
      await ready(page)
      await openPalette(page)
      await page.locator('#palette input').fill(`kp ${method.id.toLowerCase()}`)
      const label = page.locator('.label', { hasText: new RegExp(`^kp ${method.id.toLowerCase()}$`) })
      await page.locator('#palette [role="option"][data-kind="command"]').filter({ has: label }).click()
      const target = page.locator(`#method-${method.id.toLowerCase()}`)
      await expect(target).toBeFocused()
      await expect(target).toContainText(method.name)
      await expect(target).toBeInViewport()
    })

    test(`the method entry "${method.id} ${method.name}" scrolls to the same anchor`, async ({ page }) => {
      await ready(page)
      await openPalette(page)
      await page.locator('#palette input').fill(method.name)
      const label = page.locator('.label', { hasText: new RegExp(`^${method.id} ${method.name}$`) })
      await page.locator('#palette [role="option"][data-kind="method"]').filter({ has: label }).click()
      const target = page.locator(`#method-${method.id.toLowerCase()}`)
      await expect(target).toBeFocused()
      await expect(target).toBeInViewport()
    })
  }
})

test.describe('readout on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap on a summit shows its area in the readout, with no horizontal scroll', async ({ page }) => {
    await ready(page)
    const summit = page.locator(`#sheet a.summit[data-summit="${firstDomain.id}"]`)
    await summit.scrollIntoViewIfNeeded()
    await summit.tap()
    await expect(page.locator('#readout-h')).toHaveText(firstDomain.name)
    await expect(summit).toHaveAttribute('aria-current', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})

test.describe('readout', () => {
  test('Enter on a summit shows that domain in the readout', async ({ page }) => {
    await ready(page)
    await openAreaFromSummit(page, firstDomain.id)
    await expect(page.locator('#readout-h')).toBeFocused()
    const readoutText = await page.locator('#readout').innerText()
    for (const proof of model.proofs.filter((item) => item.domainId === firstDomain.id)) expect(readoutText).toContain(proof.label)
  })

  test('lists the domain upstream rows, their statuses and pinned links with real hrefs', async ({ page }) => {
    await ready(page)
    await openAreaFromSummit(page, firstDomain.id)
    const rows = upstreamIn(firstDomain.id)
    expect(rows.length).toBeGreaterThan(0)
    await expect(page.locator('#readout .ro-up > li')).toHaveCount(rows.length)
    for (const row of rows) {
      await expect(page.locator(`#readout a[href="${row.href}"]`).filter({ hasText: row.label })).toHaveCount(1)
      const item = page.locator('#readout .ro-up > li').filter({ has: page.locator(`a[href="${row.href}"]`) })
      await expect(item.locator('.st-chip')).toHaveCount(row.statuses.length)
      for (const link of row.links) {
        await expect(page.locator(`#readout a[href="${link.href}"]`).filter({ hasText: link.note })).toHaveCount(1)
      }
    }
  })

  test('the readout is part of the page: nothing goes inert while an area is shown', async ({ page }) => {
    await ready(page)
    await openAreaFromSummit(page, firstDomain.id)
    const inert = () =>
      page.evaluate(() => ['header.bar', 'main', 'footer'].map((selector) => (document.querySelector(selector) as HTMLElement).inert))
    expect(await inert()).toEqual([false, false, false])
  })

  test('at 390 px an open area causes no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    await openAreaFromSummit(page, firstDomain.id)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })

  test('with reduced motion the command line is typed at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    const typed = await page.evaluate((domainId) => {
      document.querySelector<HTMLElement>(`#sheet a.summit[data-summit="${domainId}"]`)!.click()
      return document.querySelector('#sheet-cmd [data-cmd-text]')!.textContent
    }, firstDomain.id)
    expect(typed).toBe(`kp open ${firstDomain.id}`)
  })
})

test.describe('home page with JavaScript at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('has no horizontal scroll with the bar mounted', async ({ page }) => {
    await ready(page)
    await expect(page.locator('header.bar')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })

  test('the palette is a bottom sheet', async ({ page }) => {
    await ready(page)
    await page.locator('#palette-open').click()
    const box = await page.locator('#palette .pal-box').boundingBox()
    expect(Math.round(box!.y + box!.height)).toBe(844)
  })
})
