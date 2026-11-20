import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'

const teachProofIds = new Set(model.range.filter((cell) => cell.mode === 'teach').flatMap((cell) => cell.proofIds))
const teachLabels = model.proofs.filter((proof) => teachProofIds.has(proof.id)).map((proof) => proof.label)
const firstDomain = model.domains[0]

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

  test('number keys are ignored while typing in the palette', async ({ page }) => {
    await ready(page)
    await openPalette(page)
    await page.keyboard.type('3')
    await expect(page.locator('#stage')).toHaveAttribute('data-lens', 'plan')
    await expect(page.locator('#palette input')).toHaveValue('3')
  })
})

test.describe('palette', () => {
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

test.describe('drawer', () => {
  test('Enter on a domain node opens the drawer for that domain', async ({ page }) => {
    await ready(page)
    const node = await openDrawerFromNode(page, firstDomain.id)
    await expect(page.locator('#drawer h2')).toHaveText(firstDomain.name)
    await expect(node).toHaveAttribute('aria-expanded', 'true')
    const drawerText = await page.locator('#drawer').innerText()
    for (const proof of model.proofs.filter((item) => item.domainId === firstDomain.id)) expect(drawerText).toContain(proof.label)
  })

  test('lists the domain upstream items with their real hrefs', async ({ page }) => {
    await ready(page)
    await openDrawerFromNode(page, firstDomain.id)
    for (const item of firstDomain.upstream) {
      await expect(page.locator(`#drawer a[href="${item.href}"]`).filter({ hasText: item.label })).toHaveCount(1)
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
