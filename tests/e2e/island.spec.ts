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

async function openDrawerFromNode(page: Page, domainId: string) {
  const node = page.locator(`#stage [data-node="${domainId}"]`)
  await node.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#drawer')).toBeVisible()
  return node
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

test.describe('lens state', () => {
  test('starts in plan with the plan button pressed', async ({ page }) => {
    await ready(page)
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await expect(page.locator('[data-lens-button="plan"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('pressing 2 switches to terrain and writes the hash', async ({ page }) => {
    await ready(page)
    await page.keyboard.press('2')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'terrain')
    await expect(page.locator('[data-lens-button="terrain"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-lens-button="plan"]')).toHaveAttribute('aria-pressed', 'false')
    expect(new URL(page.url()).hash).toBe('#lens-terrain')
  })

  test('keys 1 to 5 map to plan, terrain, console, index, range', async ({ page }) => {
    await ready(page)
    for (const [key, lens] of [['3', 'console'], ['4', 'index'], ['5', 'range'], ['1', 'plan']]) {
      await page.keyboard.press(key)
      await expect(page.locator('#stage'), key).toHaveAttribute('data-lens', lens)
    }
  })

  test('the segmented control switches lens on click', async ({ page }) => {
    await ready(page)
    await page.locator('[data-lens-button="index"]').click()
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'index')
  })

  test('loading /#lens-console starts in console', async ({ page }) => {
    await ready(page, '/#lens-console')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'console')
    await expect(page.locator('[data-lens-button="console"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('number keys are ignored while the drawer is open', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    await page.keyboard.press('2')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
  })

  test('keyboard shortcuts can be turned off and on from the palette', async ({ page }) => {
    await ready(page)
    await runPalette(page, 'keyboard shortcuts')
    await page.keyboard.press('2')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('#palette')).toBeVisible()
    await expect(page.locator('#palette [role="option"][data-kind="setting"]')).toContainText('Keyboard shortcuts: off')
    await page.keyboard.press('Escape')
    await runPalette(page, 'keyboard shortcuts')
    await page.keyboard.press('2')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'terrain')
  })

  test('turning shortcuts off persists across reload', async ({ page }) => {
    await ready(page)
    await runPalette(page, 'keyboard shortcuts')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await page.keyboard.press('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await openPalette(page)
    await page.locator('#palette input').fill('keyboard shortcuts')
    await expect(page.locator('#palette [aria-selected="true"]')).toContainText('Keyboard shortcuts: off')
  })

  test('the home page has one theme control and one switch, both named as everywhere else', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    const visible = (selector: string) =>
      page.locator(selector).evaluateAll((items) => items.filter((item) => item.checkVisibility()).map((item) => item.textContent?.trim()))
    expect(await visible('[data-theme-control]')).toEqual(['Theme: system'])
    expect(await visible('[data-shortcuts-control]')).toEqual(['Keyboard shortcuts'])
  })

  test('the bar switch turns keys 1 to 5 off and on, and the palette entry follows', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    const bar = page.locator('#shortcuts-toggle')
    await expect(bar).toBeVisible()
    await expect(bar).toHaveText('Keyboard shortcuts')
    await expect(bar).toHaveAttribute('aria-pressed', 'true')
    await bar.click()
    await expect(bar).toHaveAttribute('aria-pressed', 'false')
    await page.locator('body').click({ position: { x: 5, y: 400 } })
    await page.keyboard.press('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await openPalette(page)
    await page.locator('#palette input').fill('keyboard shortcuts')
    await expect(page.locator('#palette [aria-selected="true"]')).toContainText('Keyboard shortcuts: off')
    await page.keyboard.press('Enter')
    await expect(bar).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'console')
  })

  test('a digit key on a layout that types another character still switches the lens', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '"', code: 'Digit3', bubbles: true })))
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'console')
  })

  test('number keys are ignored while typing in the palette', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.keyboard.type('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await expect(page.locator('#palette input')).toHaveValue('3')
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
    await expect(page.locator('#palette input')).toHaveAttribute('placeholder', 'Search domains, proofs, methods, materials, lenses')
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

  test('lists domains, proofs, methods, materials, modes, lenses and theme', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    const kinds = await page
      .locator('#palette [role="option"][data-kind]')
      .evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute('data-kind')))])
    expect(kinds.sort()).toEqual(['domain', 'lens', 'material', 'method', 'mode', 'proof', 'setting', 'theme'])
  })

  test('arrow keys move the selection and Enter acts', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.locator('#palette input').fill('lens: ')
    const selected = page.locator('#palette [aria-selected="true"]')
    await expect(selected).toContainText('lens: plan')
    await page.keyboard.press('ArrowDown')
    await expect(selected).toContainText('lens: terrain')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await expect(selected).toContainText('lens: terrain')
    await page.keyboard.press('Enter')
    await expect(page.locator('#palette')).toBeHidden()
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'terrain')
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

  test('kp commands open a domain and switch a lens', async ({ page }) => {
    await ready(page)
    await runPalette(page, `kp ${firstDomain.id}`)
    await expect(page.locator('#drawer h2')).toHaveText(firstDomain.name)
    await page.keyboard.press('Escape')
    await runPalette(page, 'kp range')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'range')
  })

  test('a material opens the drawer with the domains and proofs that use it', async ({ page }) => {
    await ready(page)
    const material = model.materials.find((item) => item.id === 'solidity')!
    await runPalette(page, `material: ${material.name}`)
    await expect(page.locator('#drawer h2')).toHaveText(material.name)
    const drawerText = await page.locator('#drawer').innerText()
    for (const proofId of material.usedIn) {
      const proof = model.proofs.find((item) => item.id === proofId)!
      expect(drawerText).toContain(proof.label)
      expect(drawerText).toContain(model.domains.find((domain) => domain.id === proof.domainId)!.name)
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
    test(`${path} has the theme control and the shortcuts switch`, async ({ page }) => {
      await page.goto(path)
      const theme = page.locator('footer [data-theme-control]')
      const keys = page.locator('footer [data-shortcuts-control]')
      await expect(theme).toHaveText('Theme: system')
      await theme.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(theme).toHaveText('Theme: light')
      await expect(keys).toHaveAttribute('aria-pressed', 'true')
      await keys.click()
      await expect(keys).toHaveAttribute('aria-pressed', 'false')
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('footer [data-shortcuts-control]')).toHaveAttribute('aria-pressed', 'false')
    })
  }

  test('on a phone the footer keeps the theme control and leaves out the shortcuts switch', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/work/schedule-service/')
    await expect(page.locator('footer [data-theme-control]')).toBeVisible()
    await expect(page.locator('footer [data-shortcuts-control]')).toBeHidden()
  })

  test('the shortcuts switch set on a case page holds on the home page', async ({ page }) => {
    await page.goto('/work/schedule-service/')
    await page.locator('footer [data-shortcuts-control]').click()
    await ready(page)
    await page.locator('body').click({ position: { x: 5, y: 400 } })
    await page.keyboard.press('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
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

test.describe('drawer on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  async function openByTap(page: Page) {
    await ready(page)
    const node = page.locator(`#stage [data-node="${firstDomain.id}"]`)
    await node.scrollIntoViewIfNeeded()
    await node.tap()
    await expect(page.locator('#drawer')).toBeVisible()
    return node
  }

  test('a touch scroll that starts outside the drawer leaves it open', async ({ page }) => {
    await openByTap(page)
    // Measure the sheet once it has slid in.
    await page.waitForFunction(() => document.getElementById('drawer')!.getAnimations({ subtree: true }).length === 0)
    await page.waitForTimeout(400)
    const top = await page.locator('#drawer').evaluate((drawer) => drawer.getBoundingClientRect().top)
    expect(top).toBeGreaterThan(170)
    const before = await page.evaluate(() => window.scrollY)
    // A finger lands above the bottom sheet and drags up: the page behind scrolls.
    const client = await page.context().newCDPSession(page)
    const startY = Math.round(top - 20)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: startY }] })
    for (let step = 1; step <= 10; step++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: startY - step * 15 }] })
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(300)
    await expect(page.locator('#drawer')).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
  })

  test('a tap outside the drawer closes it and returns focus to the node', async ({ page }) => {
    const node = await openByTap(page)
    await page.touchscreen.tap(195, 120)
    await expect(page.locator('#drawer')).toBeHidden()
    await expect(node).toBeFocused()
  })
})

test.describe('drawer', () => {
  test('Enter on a domain node opens the drawer for that domain', async ({ page }) => {
    await ready(page)
    const node = await openDrawerFromNode(page, firstDomain.id)
    await expect(page.locator('#drawer h2')).toHaveText(firstDomain.name)
    await expect(node).toHaveAttribute('aria-expanded', 'true')
    const drawerText = await page.locator('#drawer').innerText()
    for (const proof of model.proofs.filter((item) => item.domainId === firstDomain.id)) expect(drawerText).toContain(proof.label)
  })

  test('lists the domain upstream rows, their statuses and pinned links with real hrefs', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    const rows = upstreamIn(firstDomain.id)
    expect(rows.length).toBeGreaterThan(0)
    await expect(page.locator('#drawer .dr-up > li')).toHaveCount(rows.length)
    for (const row of rows) {
      await expect(page.locator(`#drawer a[href="${row.href}"]`).filter({ hasText: row.label })).toHaveCount(1)
      const item = page.locator('#drawer .dr-up > li').filter({ has: page.locator(`a[href="${row.href}"]`) })
      await expect(item.locator('.st-chip')).toHaveCount(row.statuses.length)
      for (const link of row.links) {
        await expect(page.locator(`#drawer a[href="${link.href}"]`).filter({ hasText: link.note })).toHaveCount(1)
      }
    }
  })

  test('Tab stays inside the open drawer', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    const focusables = await page.locator('#drawer a[href], #drawer button').count()
    for (let step = 0; step < focusables + 3; step++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.getElementById('drawer')!.contains(document.activeElement)), `Tab ${step}`).toBe(true)
    }
    for (let step = 0; step < focusables + 3; step++) {
      await page.keyboard.press('Shift+Tab')
      expect(await page.evaluate(() => document.getElementById('drawer')!.contains(document.activeElement)), `Shift+Tab ${step}`).toBe(true)
    }
  })

  test('Esc closes the drawer and returns focus to the node', async ({ page }) => {
    await ready(page)
    const node = await openDrawerFromNode(page, firstDomain.id)
    await page.keyboard.press('Escape')
    await expect(page.locator('#drawer')).toBeHidden()
    await expect(node).toBeFocused()
    await expect(node).toHaveAttribute('aria-expanded', 'false')
  })

  test('Esc returns focus to a re-rendered node for the same domain', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    await page.evaluate((id) => {
      const old = document.querySelector(`#stage [data-node="${id}"]`)!
      const fresh = old.cloneNode(true) as HTMLElement
      fresh.dataset.fresh = 'yes'
      old.replaceWith(fresh)
    }, firstDomain.id)
    await page.keyboard.press('Escape')
    await expect(page.locator(`#stage [data-node="${firstDomain.id}"][data-fresh="yes"]`)).toBeFocused()
  })

  test('the rest of the page is inert while the drawer is open', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    const inert = () =>
      page.evaluate(() => ['header.bar', 'main', 'footer'].map((selector) => (document.querySelector(selector) as HTMLElement).inert))
    expect(await inert()).toEqual([true, true, true])
    await page.keyboard.press('Escape')
    expect(await inert()).toEqual([false, false, false])
  })

  test('a press outside the drawer closes it and returns focus to the node', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    const node = await openDrawerFromNode(page, firstDomain.id)
    await page.mouse.click(120, 700)
    await expect(page.locator('#drawer')).toBeHidden()
    await expect(node).toBeFocused()
  })

  test('the live region names lens switches by display name, stays quiet on load and on opening, and names a step', async ({ page }) => {
    await ready(page)
    const live = page.locator('#island-live')
    await expect(live).toHaveText('')
    await page.keyboard.press('3')
    await expect(live).toHaveText('Lens: Console')
    await openDrawerFromNode(page, firstDomain.id)
    await expect(live).toHaveText('Lens: Console')
    await page.locator('#drawer [data-step="next"]').click()
    await expect(live).toHaveText(`Showing ${model.domains[1].name}`)
  })

  test('next and previous step through the domains', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    await page.locator('#drawer [data-step="next"]').click()
    await expect(page.locator('#drawer h2')).toHaveText(model.domains[1].name)
    await page.locator('#drawer [data-step="prev"]').click()
    await page.locator('#drawer [data-step="prev"]').click()
    await expect(page.locator('#drawer h2')).toHaveText(model.domains[model.domains.length - 1].name)
  })

  test('at 1280 px the side sheet starts below the sticky header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await ready(page)
    await page.mouse.wheel(0, 600)
    await openDrawerFromNode(page, firstDomain.id)
    // The sheet slides in; wait for it to settle against the right edge before measuring.
    await expect.poll(async () => {
      const box = await page.locator('#drawer').boundingBox()
      return Math.round(box!.x + box!.width)
    }).toBe(1280)
    const header = await page.locator('header.bar').boundingBox()
    const drawer = await page.locator('#drawer').boundingBox()
    expect(drawer!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 0.5)
  })

  test('at 720 px the side sheet starts below the header', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 800 })
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    const header = await page.locator('header.bar').boundingBox()
    const drawer = await page.locator('#drawer').boundingBox()
    expect(drawer!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 0.5)
  })

  test('at 390 px the drawer is a bottom sheet with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    await expect.poll(async () => {
      const box = await page.locator('#drawer').boundingBox()
      return Math.round(box!.y + box!.height)
    }).toBe(844)
    const box = await page.locator('#drawer').boundingBox()
    expect(box!.x).toBe(0)
    expect(box!.width).toBe(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })

  test('with reduced motion the drawer opens without a transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    const durations = await page.evaluate(() => getComputedStyle(document.getElementById('drawer')!).transitionDuration)
    expect(durations.split(',').every((value) => parseFloat(value) === 0)).toBe(true)
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
