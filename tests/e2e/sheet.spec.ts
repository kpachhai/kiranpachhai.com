import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { model } from '../../src/model'
import { upstreamIn } from '../../src/lib/site'

// The site-plan sheet on the home page. Every expected value is computed here from the model, so
// the sheet's own geometry code is checked against the data rather than against itself.
const pad = (value: number) => String(value).padStart(2, '0')
const proofsIn = (domainId: string) => model.proofs.filter((proof) => proof.domainId === domainId)
const lettersOf = (domainId: string): string[] => {
  const used = new Set<string>(proofsIn(domainId).flatMap((proof) => proof.methods))
  return model.methods.map((method) => method.id).filter((id) => used.has(id))
}
const areasUsing = (methodId: string) => model.domains.filter((domain) => lettersOf(domain.id).includes(methodId)).map((domain) => domain.id)
const areaNumber = (domainId: string) => pad(model.domains.findIndex((domain) => domain.id === domainId) + 1)
const proofCount = (count: number) => `${count} ${count === 1 ? 'proof' : 'proofs'}`
const trailMethods = model.methods.filter((method) => areasUsing(method.id).length >= 2).map((method) => method.id)
const spotMethods = model.methods.filter((method) => areasUsing(method.id).length === 1).map((method) => method.id)
const BANDS = ['language', 'stack', 'tool', 'discipline'] as const

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

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
  await page.evaluate(() => document.fonts.ready)
}

const visibleDrawings = (page: Page) =>
  page.locator('.sheet-drawing svg[data-shape]').evaluateAll((svgs) => svgs.filter((svg) => svg.checkVisibility()).map((svg) => svg.getAttribute('data-shape')))

test.describe('sheet content', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the sheet shows six summits whose names, counts and method letters match the model', async ({ page }) => {
    await ready(page)
    const summits = page.locator('#sheet a.summit')
    await expect(summits).toHaveCount(model.domains.length)
    for (const [position, domain] of model.domains.entries()) {
      const summit = page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)
      await expect(summit).toHaveAttribute('href', `#area-${domain.id}`)
      await expect(summit.locator('.no')).toHaveText(pad(position + 1))
      await expect(summit.locator('.name')).toHaveText(domain.name)
      const count = proofsIn(domain.id).length
      await expect(summit.locator('.count')).toHaveText(`${count} ${count === 1 ? 'proof' : 'proofs'}`)
      expect(await summit.locator('[data-letter]').allTextContents(), domain.id).toEqual(lettersOf(domain.id))
      for (const style of ['--x-wide', '--y-wide', '--x-tall', '--y-tall']) {
        expect(await summit.evaluate((element, name) => element.style.getPropertyValue(name), style), `${domain.id} ${style}`).toMatch(/^\d+$/)
      }
    }
    expect(await page.locator('[data-summit]').count()).toBe(model.domains.length)
  })

  // The slash between the count and the letters is painted, not spoken, so the link names the
  // letters as methods: "7 proofs, methods A B C D E", or just the count when an area has none.
  test('each summit link reads its proof count and, where it has any, "methods" and the letters one by one', async ({ page }) => {
    await ready(page)
    for (const domain of model.domains) {
      const count = proofCount(proofsIn(domain.id).length)
      const letters = lettersOf(domain.id)
      const methods = letters.length > 0 ? `\\s?, methods ${letters.join(' ')}` : ''
      await expect(page.locator(`#sheet a.summit[data-summit="${domain.id}"]`), domain.id).toHaveAccessibleName(new RegExp(`^${domain.name} ${count}${methods}$`, 'i'))
    }
  })

  test('the schedule fills exactly the cells model.range lists, with their counts', async ({ page }) => {
    await ready(page)
    const cells = await page.locator('#sheet td[data-cell]').evaluateAll((items) => items.map((item) => ({ cell: item.getAttribute('data-cell')!, text: item.textContent?.trim() ?? '' })))
    expect(cells).toHaveLength(model.domains.length * model.modes.length)
    const filled = cells.filter((item) => item.text !== '').map((item) => `${item.cell}=${item.text}`).sort()
    expect(filled).toEqual(model.range.map((entry) => `${entry.domainId}/${entry.mode}=${entry.proofIds.length}`).sort())
    await expect(page.locator('#sheet a[href="#range"]')).toHaveText('Every proof, in the Range table below')
  })

  test('the methods table lists A-E with the areas that use each, and draws spots for single-area methods', async ({ page }) => {
    await ready(page)
    const rows = page.locator('#sheet tr[data-method]')
    await expect(rows).toHaveCount(model.methods.length)
    for (const method of model.methods) {
      const row = page.locator(`#sheet tr[data-method="${method.id}"]`)
      await expect(row.locator('.rev')).toHaveText(method.id)
      await expect(row.locator('.mname')).toHaveText(method.name)
      await expect(row.locator('.areas')).toHaveText(areasUsing(method.id).map(areaNumber).join(', '))
      await expect(row.locator('.swatch.spot')).toHaveCount(spotMethods.includes(method.id) ? 1 : 0)
    }
    for (const shape of ['wide', 'tall']) {
      const svg = page.locator(`.sheet-drawing svg[data-shape="${shape}"]`)
      expect(await svg.locator('path.trail[data-method]').evaluateAll((paths) => paths.map((path) => path.getAttribute('data-method'))), shape).toEqual(trailMethods)
    }
    // The tags render once, over whichever drawing is shown.
    expect(await page.locator('#sheet .tag[data-method]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute('data-method')))).toEqual(trailMethods)
    await expect(page.locator('#sheet .tag[data-method]').first()).toBeVisible()
    for (const methodId of spotMethods) {
      const [domainId] = areasUsing(methodId)
      await expect(page.locator(`#sheet a.summit[data-summit="${domainId}"] .spot[data-letter="${methodId}"]`), methodId).toHaveCount(1)
    }
    expect(await page.locator('#sheet a.summit .spot').count()).toBe(spotMethods.length)
  })

  test('the materials schedule lists every model material in its band', async ({ page }) => {
    await ready(page)
    const schedule = page.locator('#sheet .materials')
    expect(model.materials.every((material) => (BANDS as readonly string[]).includes(material.band))).toBe(true)
    for (const band of BANDS) {
      const materials = model.materials.filter((material) => material.band === band)
      const rows = schedule.locator(`[data-band="${band}"] li[data-material]`)
      expect(await rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-material'))), band).toEqual(materials.map((material) => material.id))
      for (const material of materials) {
        const row = schedule.locator(`li[data-material="${material.id}"]`)
        await expect(row.locator('.mt')).toHaveText(material.name)
        const used = (await row.locator('.used').textContent()) ?? ''
        for (const id of material.usedIn) expect(used, `${material.id} lists ${id}`).toContain(model.proofs.find((proof) => proof.id === id)!.label)
      }
    }
    await expect(schedule.locator('li[data-material]')).toHaveCount(model.materials.length)
  })

  test('at rest the readout prints kp map and the six areas with their proof counts, each a button', async ({ page }) => {
    await ready(page)
    const readout = page.locator('#readout')
    await expect(readout).toBeVisible()
    await expect(readout.locator('.ro-cmd')).toHaveText('$ kp map')
    await expect(page.locator('#readout-h')).toHaveText(`${model.domains.length} areas / ${model.proofs.length} proofs / select one`)
    const lines = readout.locator('.ro-tree button[data-readout-area]')
    await expect(lines).toHaveCount(model.domains.length)
    for (const [position, domain] of model.domains.entries()) {
      const line = lines.nth(position)
      await expect(line).toHaveAttribute('data-readout-area', domain.id)
      await expect(line.locator('.ro-no')).toHaveText(pad(position + 1))
      await expect(line.locator('.ro-name')).toHaveText(domain.name)
      await expect(line.locator('.ro-count')).toHaveText(proofCount(proofsIn(domain.id).length))
    }
  })

  test('opening a summit types kp open <id>, marks the summit current, and lists the area\'s proofs, methods, source tags and upstream rows', async ({ page }) => {
    await ready(page)
    const domain = model.domains.find((item) => item.id === 'wallets')!
    const summit = page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)
    await summit.click()
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText(`kp open ${domain.id}`)
    await expect(summit).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#sheet a.summit[aria-current="true"]')).toHaveCount(1)
    expect(new URL(page.url()).hash).toBe('')

    const readout = page.locator('#readout')
    await expect(readout.locator('.ro-cmd')).toHaveText(`$ kp open ${domain.id}`)
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await expect(page.locator('#readout-h')).toBeFocused()
    await expect(readout.locator('.ro-out')).toHaveText(`Area ${areaNumber(domain.id)} of ${pad(model.domains.length)} / ${proofCount(proofsIn(domain.id).length)} / methods ${lettersOf(domain.id).join(' ')}`)

    const proofs = proofsIn(domain.id)
    await expect(readout.locator('.ro-proofs > li')).toHaveCount(proofs.length)
    await page.locator('#provenance-toggle').click()
    for (const proof of proofs) {
      const item = readout.locator(`.ro-proofs > li[data-claim-id="readout-proof-${proof.id}"]`)
      await expect(item.locator('.ro-pname'), proof.id).toContainText(proof.label)
      if (proof.href) await expect(item.locator(`.ro-pname a[href="${proof.href}"]`), proof.id).toHaveText(proof.label)
      const modes = model.range.filter((cell) => cell.proofIds.includes(proof.id)).map((cell) => cell.mode)
      const meta = [modes.join(', '), proof.methods.length > 0 ? `methods ${proof.methods.join(' ')}` : ''].filter(Boolean).join(' / ')
      await expect(item.locator('.ro-modes'), proof.id).toHaveText(meta)
      await expect(item.locator('[data-claim-source]'), proof.id).toHaveCount(1)
      await expect(item.locator('[data-claim-source]'), proof.id).toBeVisible()
    }
    expect(await readout.locator('.ro-chips [data-method]').evaluateAll((chips) => chips.map((chip) => chip.getAttribute('data-method')))).toEqual(lettersOf(domain.id))

    const rows = upstreamIn(domain.id)
    expect(rows.length).toBeGreaterThan(0)
    await expect(readout.locator('.ro-up > li')).toHaveCount(rows.length)
    for (const row of rows) {
      const item = readout.locator('.ro-up > li').filter({ has: page.locator(`a[href="${row.href}"]`) })
      await expect(item.locator(`a[href="${row.href}"]`).first()).toHaveText(row.label)
      await expect(item.locator('.st-chip')).toHaveCount(row.statuses.length)
      for (const link of row.links) await expect(readout.locator(`a[href="${link.href}"]`).filter({ hasText: link.note })).toHaveCount(1)
    }
  })

  // A modified click is the reader asking for the link itself (a new tab or window), so the
  // readout leaves it alone. Whether a browser then opens a tab differs by platform (headless
  // Chromium on Linux opens none for a same-page link), so the test checks the site's part: the
  // click reaches the window unprevented. The window listener then cancels it, so the test page
  // stays where it is.
  test('a Ctrl, Cmd or Shift click on a summit is left to the browser and the readout stays at rest', async ({ page }) => {
    await ready(page)
    await page.evaluate(() => {
      const prevented: boolean[] = []
      ;(window as unknown as { modifiedClicks: boolean[] }).modifiedClicks = prevented
      window.addEventListener('click', (event) => {
        prevented.push(event.defaultPrevented)
        event.preventDefault()
      })
    })
    const summit = page.locator(`#sheet a.summit[data-summit="${model.domains[0].id}"]`)
    for (const modifier of ['ControlOrMeta', 'Shift'] as const) {
      await summit.click({ modifiers: [modifier] })
      await expect(page.locator('#readout .ro-cmd'), modifier).toHaveText('$ kp map')
      await expect(page.locator('#sheet a.summit[aria-current]'), modifier).toHaveCount(0)
    }
    expect(await page.evaluate(() => (window as unknown as { modifiedClicks: boolean[] }).modifiedClicks)).toEqual([false, false])
  })

  test('proofs without an href render as text, not links', async ({ page }) => {
    await ready(page)
    for (const label of ['Hedera Wallet Snap', 'Cross-ledger explorer']) {
      const proof = model.proofs.find((item) => item.label === label)!
      expect(proof.href, label).toBeUndefined()
      await page.locator(`#sheet a.summit[data-summit="${proof.domainId}"]`).click()
      const name = page.locator(`#readout li[data-claim-id="readout-proof-${proof.id}"] .ro-pname`)
      await expect(name).toContainText(proof.label)
      await expect(name.locator('a'), label).toHaveCount(0)
    }
  })

  test('previous and next step through areas in model order, wrapping', async ({ page }) => {
    await ready(page)
    const last = model.domains[model.domains.length - 1]
    await page.locator(`#sheet a.summit[data-summit="${model.domains[0].id}"]`).click()
    await expect(page.locator('#readout-h')).toHaveText(model.domains[0].name)
    await page.locator('#readout [data-step="next"]').click()
    await expect(page.locator('#readout-h')).toHaveText(model.domains[1].name)
    await expect(page.locator('#readout [data-step="next"]')).toBeFocused()
    await page.locator('#readout [data-step="prev"]').click()
    await page.locator('#readout [data-step="prev"]').click()
    await expect(page.locator('#readout-h')).toHaveText(last.name)
    await expect(page.locator(`#sheet a.summit[data-summit="${last.id}"]`)).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText(`kp open ${last.id}`)
    await page.locator('#readout [data-step="next"]').click()
    await expect(page.locator('#readout-h')).toHaveText(model.domains[0].name)
  })

  test('Esc returns to the tree and puts focus back on the summit that opened the area', { tag: '@smoke' }, async ({ page }) => {
    await ready(page)
    const domain = model.domains[2]
    const summit = page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)
    await summit.click()
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await page.keyboard.press('Escape')
    await expect(page.locator('#readout .ro-tree button[data-readout-area]')).toHaveCount(model.domains.length)
    await expect(page.locator('#readout .ro-cmd')).toHaveText('$ kp map')
    await expect(summit).toBeFocused()
    await expect(page.locator('#sheet a.summit[aria-current]')).toHaveCount(0)
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText('kp open')
  })

  test('Ctrl K opens search while an area is shown, and choosing a domain shows it in the readout', async ({ page }) => {
    await ready(page)
    await page.locator(`#sheet a.summit[data-summit="${model.domains[0].id}"]`).click()
    await expect(page.locator('#readout-h')).toHaveText(model.domains[0].name)
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('#palette')).toBeVisible()
    const target = model.domains[3]
    await page.locator('#palette input').fill(`domain: ${target.name}`)
    await page.keyboard.press('Enter')
    await expect(page.locator('#palette')).toBeHidden()
    await expect(page.locator('#readout-h')).toHaveText(target.name)
    await expect(page.locator('#readout-h')).toBeFocused()
    await expect(page.locator(`#sheet a.summit[data-summit="${target.id}"]`)).toHaveAttribute('aria-current', 'true')
  })

  test('a materials row shows that material\'s proofs and the areas that use it', async ({ page }) => {
    await ready(page)
    const material = model.materials.find((item) => item.id === 'solidity')!
    const row = page.locator(`#sheet li[data-material="${material.id}"] button.mat-row`)
    await row.click()
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#sheet [data-material-open][aria-current]')).toHaveCount(1)
    await expect(page.locator('#sheet [data-material-open][aria-expanded]')).toHaveCount(0)
    await expect(row).toHaveAttribute('aria-controls', 'readout')
    await expect(page.locator('#readout-h')).toHaveText(material.name)
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText(`kp open ${material.id}`)
    const used = model.proofs.filter((proof) => material.usedIn.includes(proof.id))
    expect(await page.locator('#readout .ro-proofs > li').evaluateAll((items) => items.map((item) => item.getAttribute('data-claim-id')))).toEqual(
      material.usedIn.map((id) => `readout-proof-${id}`),
    )
    const areas = model.domains.filter((domain) => used.some((proof) => proof.domainId === domain.id))
    expect(await page.locator('#readout button[data-open-domain]').allTextContents()).toEqual(areas.map((domain) => domain.name))
    await page.keyboard.press('Escape')
    await expect(row).toBeFocused()
    await expect(row).not.toHaveAttribute('aria-current', /.*/)
  })

  test('a material\'s Areas button shows that area in the readout', async ({ page }) => {
    await ready(page)
    const material = model.materials.find((item) => item.id === 'solidity')!
    const proof = model.proofs.find((item) => item.id === material.usedIn[0])!
    const domain = model.domains.find((item) => item.id === proof.domainId)!
    await page.locator(`#sheet li[data-material="${material.id}"] button.mat-row`).click()
    await page.locator(`#readout button[data-open-domain="${domain.id}"]`).click()
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await expect(page.locator('#readout-h')).toBeFocused()
    await expect(page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#sheet [data-material-open][aria-current]')).toHaveCount(0)
  })

  test('a tree line shows its area in the readout', async ({ page }) => {
    await ready(page)
    const domain = model.domains[4]
    await page.locator(`#readout .ro-tree button[data-readout-area="${domain.id}"]`).click()
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await expect(page.locator('#readout-h')).toBeFocused()
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText(`kp open ${domain.id}`)
  })

  test('Back to the map shows the tree and puts focus back on the summit', async ({ page }) => {
    await ready(page)
    const domain = model.domains[1]
    const summit = page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)
    await summit.click()
    await page.locator('#readout [data-readout-back]').click()
    await expect(page.locator('#readout .ro-tree button[data-readout-area]')).toHaveCount(model.domains.length)
    await expect(summit).toBeFocused()
    await expect(page.locator('#sheet a.summit[aria-current]')).toHaveCount(0)
  })

  test('Esc pressed elsewhere on the page leaves the readout and the scroll position alone', async ({ page }) => {
    await ready(page)
    const domain = model.domains[0]
    await page.locator(`#sheet a.summit[data-summit="${domain.id}"]`).click()
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await page.locator('#timeline').scrollIntoViewIfNeeded()
    // Plain text: the click focuses nothing, so focus falls back to the body.
    await page.locator('#tl-h').click()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
    const before = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
  })

  test('hovering or focusing a methods row lights that method\'s trail and tag', async ({ page }) => {
    await ready(page)
    const [first, second] = trailMethods
    const lit = () =>
      page.evaluate(() => ({
        rows: [...document.querySelectorAll('#sheet tr[data-method].on')].map((row) => row.getAttribute('data-method')),
        trails: [...document.querySelectorAll('#sheet path.trail.on')].map((path) => path.getAttribute('data-method')),
        tags: [...document.querySelectorAll('#sheet .tag.on')].map((tag) => tag.getAttribute('data-method')),
      }))
    await page.locator(`#sheet tr[data-method="${first}"]`).hover()
    expect(await lit()).toEqual({ rows: [first], trails: [first, first], tags: [first] })
    await page.mouse.move(0, 0)
    expect(await lit()).toEqual({ rows: [], trails: [], tags: [] })
    await page.locator(`#sheet tr[data-method="${second}"]`).focus()
    expect(await lit()).toEqual({ rows: [second], trails: [second, second], tags: [second] })
    const widths = await page.evaluate(
      (methodId) => [...document.querySelectorAll(`.sheet-drawing svg[data-shape] path.trail[data-method="${methodId}"]`)].filter((path) => path.checkVisibility()).map((path) => getComputedStyle(path).strokeWidth),
      second,
    )
    expect(widths).toEqual(['2.6px'])
  })

  test('the drawer is gone', async ({ page }) => {
    await ready(page)
    await expect(page.locator('#drawer')).toHaveCount(0)
    await expect(page.locator('[data-drawer-body]')).toHaveCount(0)
  })

  test('the live region announces the area shown', async ({ page }) => {
    await ready(page)
    const live = page.locator('#island-live')
    await expect(live).toHaveText('')
    // Opening from a summit moves focus to the readout heading, which is read already.
    await page.locator(`#sheet a.summit[data-summit="${model.domains[0].id}"]`).click()
    await expect(page.locator('#readout-h')).toBeFocused()
    await expect(live).toHaveText('')
    await page.locator('#readout [data-step="next"]').click()
    await expect(live).toHaveText(`Showing ${model.domains[1].name}`)
  })

  test('the title block totals match the model', async ({ page }) => {
    await ready(page)
    await expect(page.locator('#sheet [data-totals]')).toHaveText(`${model.domains.length} / ${model.proofs.length}`)
    await expect(page.locator('#sheet .dim-label')).toHaveText(`${model.domains.length} areas of work / ${model.proofs.length} proof items`)
    await expect(page.locator('#sheet .title-block')).toContainText('KP-001')
  })

  test('the datum box lists exactly the model\'s language-band materials', async ({ page }) => {
    await ready(page)
    const languages = model.materials.filter((material) => material.band === 'language').map((material) => material.name)
    expect(await page.locator('#sheet .datum em').allTextContents()).toEqual(languages)
  })

  test('there is no lens switcher', async ({ page }) => {
    await ready(page)
    await expect(page.locator('[data-lens-button]')).toHaveCount(0)
    await expect(page.locator('[data-lens]')).toHaveCount(0)
  })

  test('the command line opens search', async ({ page }) => {
    await ready(page)
    await expect(page.locator('#sheet-cmd [data-cmd-text]')).toHaveText('kp open')
    await page.locator('#sheet-cmd').click()
    await expect(page.locator('#palette')).toBeVisible()
    await expect(page.locator('#palette input')).toBeFocused()
  })

  // The command line and the readout print kp open <id>, so typing it in search works too.
  test('typing kp open wallets in search shows Wallets in the readout', async ({ page }) => {
    await ready(page)
    const domain = model.domains.find((item) => item.id === 'wallets')!
    await page.locator('#sheet-cmd').click()
    await page.locator('#palette input').fill(`kp open ${domain.id}`)
    await page.keyboard.press('Enter')
    await expect(page.locator('#palette')).toBeHidden()
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
  })

  // The caret draws the eye for a moment, then holds still.
  test('the command line caret stops blinking within 5 s', async ({ page }) => {
    await ready(page)
    const ends = await page.locator('#sheet-cmd .caret').evaluate((caret) => caret.getAnimations().map((animation) => animation.effect!.getComputedTiming().endTime))
    expect(ends).toHaveLength(1)
    expect(Number(ends[0])).toBeLessThanOrEqual(5000)
  })

  test('the readout region is labelled', async ({ page }) => {
    await ready(page)
    const readout = page.locator('section#readout')
    await expect(readout).toHaveCount(1)
    const labelId = await readout.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    await expect(page.locator(`[id="${labelId}"]`)).toHaveCount(1)
  })
})

test.describe('sheet hashes', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('old lens hashes land on the sheet', { tag: '@smoke' }, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    // The lens site wrote #lens-<id>, Range included; the bare names come from older links.
    const hashes = ['lens-terrain', 'lens-plan', 'lens-console', 'lens-index', 'lens-range', 'plan', 'terrain', 'console', 'index']
    for (const [position, hash] of hashes.entries()) {
      // The first lands on load; the rest arrive as hash changes on a page scrolled to its foot.
      if (position > 0) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.goto(`/#${hash}`)
      await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
      await expect(page.locator('#sheet'), hash).toBeInViewport()
      await expect.poll(() => page.evaluate(() => window.location.hash), hash).toBe('')
    }
    // A query string survives the hash being dropped.
    await page.goto('/?x=1#lens-plan')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await expect(page.locator('#sheet')).toBeInViewport()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    expect(await page.evaluate(() => window.location.search)).toBe('?x=1')
    // Bare #range still names the Range section.
    await page.goto('/#range')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await expect(page.locator('#range')).toBeInViewport()
    expect(new URL(page.url()).hash).toBe('#range')
    expect(errors).toEqual([])
  })

  test('#range lands on the Range section', async ({ page }) => {
    await page.goto('/#range')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await expect(page.locator('#range')).toBeInViewport()
    expect(new URL(page.url()).hash).toBe('#range')
  })

  test('#area-wallets opens the wallets area in the readout', async ({ page }) => {
    const domain = model.domains.find((item) => item.id === 'wallets')!
    await page.goto('/#area-wallets')
    await expect(page.locator('html')).toHaveAttribute('data-island', 'ready')
    await expect(page.locator('#readout-h')).toHaveText(domain.name)
    await expect(page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('#readout')).toBeInViewport()
  })
})

// Each summit label, the dimension line and the datum box as boxes, plus any label that clips.
const layoutReport = (page: Page) =>
  page.evaluate(() => {
    const visible = (element: Element) => element.checkVisibility()
    const drawing = [...document.querySelectorAll('.sheet-drawing')].find(visible)!.getBoundingClientRect()
    const boxes = [...document.querySelectorAll<HTMLElement>('#sheet a.summit, #sheet .datum, #sheet .dim')]
      .filter(visible)
      .map((element) => ({ name: element.dataset.summit ?? element.className, rect: element.getBoundingClientRect() }))
    const overlaps: string[] = []
    for (let first = 0; first < boxes.length; first++) {
      for (let second = first + 1; second < boxes.length; second++) {
        const a = boxes[first].rect
        const b = boxes[second].rect
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${boxes[first].name} / ${boxes[second].name}`)
      }
    }
    // The dimension line runs above the drawing, so only the labels and the datum box must sit inside it.
    const outside = boxes
      .filter(({ name }) => name !== 'dim')
      .filter(({ rect }) => rect.left < drawing.left - 0.5 || rect.right > drawing.right + 0.5 || rect.top < drawing.top - 0.5 || rect.bottom > drawing.bottom + 0.5)
      .map(({ name }) => name)
    const labels = [...document.querySelectorAll<HTMLElement>('#sheet .summit .name, #sheet .summit .meta, #sheet .datum, #sheet .dim-label, #sheet th, #sheet td, #sheet .title-block > div, #sheet .mat-row > *, #sheet .legend > div')]
    const clipped = labels.filter((label) => visible(label) && label.scrollWidth > label.clientWidth).map((label) => label.textContent?.trim().slice(0, 40))
    return { overlaps, outside, clipped, labels: labels.length, scroll: document.documentElement.scrollWidth }
  })

test.describe('sheet layout', () => {
  for (const width of [320, 390, 768, 900, 1024, 1280, 1440]) {
    // The phone width runs on every engine.
    test(`no horizontal scroll and no clipped label at ${width} px`, width === 390 ? { tag: '@smoke' } : {}, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      const report = await layoutReport(page)
      expect(report.labels).toBeGreaterThan(40)
      expect(report.clipped).toEqual([])
      expect(report.overlaps).toEqual([])
      expect(report.outside).toEqual([])
      expect(report.scroll).toBe(width)
    })
  }

  for (const width of [390, 900, 1280]) test(`no horizontal scroll and no clipped label at ${width} px with the root font at 200%`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await ready(page)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    const report = await layoutReport(page)
    expect(report.clipped).toEqual([])
    expect(report.overlaps).toEqual([])
    expect(report.outside).toEqual([])
    expect(report.scroll).toBe(width)
  })

  // The readout sits under the drawing and the command line, above the long materials schedule, so
  // opening an area is a short scroll rather than a jump past the schedule.
  for (const [width, height] of [[1280, 900], [390, 844]] as const) {
    test(`the readout sits above the materials schedule and opens within a viewport of the command line at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await ready(page)
      const top = (selector: string) => page.locator(selector).evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
      expect(await top('#readout')).toBeLessThan(await top('#sheet .materials'))
      await page.locator(`#sheet a.summit[data-summit="${model.domains[0].id}"]`).click()
      await expect(page.locator('#readout-h')).toBeFocused()
      const gap = (await top('#readout-h')) - (await top('#sheet-cmd'))
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeLessThanOrEqual(height)
    })
  }

  // On a phone the hint is hidden, so the name must say what the button does without it.
  test('the command line is named for what it does at 390 and 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    await expect(page.locator('#sheet-cmd')).toHaveAccessibleName('Search: kp open')
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.locator('#sheet-cmd')).toHaveAccessibleName('Search: kp open type an area, a proof or a method')
  })

  // Each tag's centre sits on its own trail in the drawing shown.
  for (const width of [390, 900, 1280]) {
    test(`every trail tag sits on its trail at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      const misses = await page.evaluate(() => {
        const svg = [...document.querySelectorAll<SVGSVGElement>('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!
        const matrix = svg.getScreenCTM()!
        const tags = [...document.querySelectorAll<HTMLElement>('#sheet .tag[data-method]')].filter((tag) => tag.checkVisibility())
        return {
          count: tags.length,
          misses: tags.flatMap((tag) => {
            const methodId = tag.getAttribute('data-method')
            const trail = svg.querySelector<SVGPathElement>(`path.trail[data-method="${methodId}"]`)!
            const box = tag.getBoundingClientRect()
            const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2]
            let nearest = Infinity
            const length = trail.getTotalLength()
            for (let at = 0; at <= length; at += 0.5) {
              const point = trail.getPointAtLength(at).matrixTransform(matrix)
              nearest = Math.min(nearest, Math.hypot(point.x - cx, point.y - cy))
            }
            return nearest > 2 ? [`${methodId} ${nearest.toFixed(1)} px off`] : []
          }),
        }
      })
      expect(misses.count).toBe(trailMethods.length)
      expect(misses.misses).toEqual([])
    })
  }

  // A trail runs from peak marker to peak marker and never across a summit's name or meta line,
  // its own included, so no label reads as struck through.
  for (const width of [320, 390, 768, 861, 900, 1024, 1280, 1440]) {
    test(`trails run between peak markers and cross no summit name or meta line at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      const report = await page.evaluate(() => {
        const svg = [...document.querySelectorAll<SVGSVGElement>('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!
        const matrix = svg.getScreenCTM()!
        const labels = [...document.querySelectorAll<HTMLElement>('#sheet .summit .name, #sheet .summit .meta')].map((label) => ({
          name: `${label.closest<HTMLElement>('.summit')!.dataset.summit} ${label.className}`,
          rect: label.getBoundingClientRect(),
        }))
        const peaks = new Map([...document.querySelectorAll<HTMLElement>('#sheet .summit')].map((summit) => [summit.dataset.summit!, summit.querySelector('.peak')!.getBoundingClientRect()]))
        return [...svg.querySelectorAll<SVGPathElement>('path.trail')].map((trail) => {
          const length = trail.getTotalLength()
          const points: { x: number; y: number }[] = []
          for (let at = 0; at <= length; at += 1) points.push(trail.getPointAtLength(at).matrixTransform(matrix))
          points.push(trail.getPointAtLength(length).matrixTransform(matrix))
          const crossings = [...new Set(points.flatMap((point) => labels.filter(({ rect }) => point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom).map(({ name }) => name)))]
          // How far, in px, the trail comes from the inside of each peak marker.
          const reach = Object.fromEntries(
            [...peaks].map(([id, rect]) => [id, Math.min(...points.map((point) => Math.hypot(Math.max(rect.left - point.x, 0, point.x - rect.right), Math.max(rect.top - point.y, 0, point.y - rect.bottom))))]),
          )
          const at = (point: { x: number; y: number }) => [...peaks].filter(([, rect]) => point.x >= rect.left - 1 && point.x <= rect.right + 1 && point.y >= rect.top - 1 && point.y <= rect.bottom + 1).map(([id]) => id)
          return { methodId: trail.dataset.method!, crossings, reach, start: at(points[0]), end: at(points[points.length - 1]) }
        })
      })
      expect(report.map((trail) => trail.methodId)).toEqual(trailMethods)
      for (const trail of report) {
        const areas = areasUsing(trail.methodId)
        expect(trail.crossings, trail.methodId).toEqual([])
        expect(trail.start, `${trail.methodId} starts on the peak of ${areas[0]}`).toContain(areas[0])
        expect(trail.end, `${trail.methodId} ends on the peak of ${areas[areas.length - 1]}`).toContain(areas[areas.length - 1])
        for (const area of areas) expect(trail.reach[area], `${trail.methodId} passes through the peak of ${area}`).toBeLessThanOrEqual(1)
      }
    })
  }

  // A spot ring keeps at least 2 px of clear space from every character around it.
  for (const width of [390, 768, 900, 1024, 1280]) {
    test(`spot rings keep 2 px clear of neighbouring characters at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      const touches = await page.evaluate(() => {
        const CLEAR = 2
        const characters = (root: Element) => {
          const boxes: { text: string; rect: DOMRect }[] = []
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            // Visually hidden text paints nothing, so no ring can touch it.
            if (node.parentElement!.closest('.sr-only')) continue
            const text = node.textContent ?? ''
            for (let k = 0; k < text.length; k++) {
              if (!text[k].trim()) continue
              const range = document.createRange()
              range.setStart(node, k)
              range.setEnd(node, k + 1)
              for (const rect of range.getClientRects()) boxes.push({ text: text[k], rect })
            }
          }
          for (const sep of root.querySelectorAll('.sep')) for (const rect of sep.getClientRects()) if (rect.width > 0.5) boxes.push({ text: '/', rect })
          return boxes
        }
        return [...document.querySelectorAll<HTMLElement>('#sheet .summit .spot')].flatMap((ring) => {
          const summit = ring.closest('.summit')!
          const own = ring.getBoundingClientRect()
          const near = characters(summit).filter(({ rect }) => {
            const inside = rect.left >= own.left && rect.right <= own.right && rect.top >= own.top && rect.bottom <= own.bottom
            if (inside) return false
            return rect.left < own.right + CLEAR && rect.right > own.left - CLEAR && rect.top < own.bottom + CLEAR && rect.bottom > own.top - CLEAR
          })
          return near.map(({ text }) => `${ring.dataset.letter} ring within ${CLEAR} px of "${text}"`)
        })
      })
      expect(touches).toEqual([])
    })
  }

  // The proof count and the method letters are units: a meta line wraps between them, never at the
  // separator, so no rendered line starts or ends with "/".
  for (const [width, font] of [[861, ''], [900, ''], [1024, ''], [390, '200%']] as const) {
    test(`no meta line starts or ends with a separator at ${width} px${font ? ` with ${font} text` : ''}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      if (font) await page.evaluate((size) => (document.documentElement.style.fontSize = size), font)
      const report = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#sheet .summit .meta')].map((meta) => {
          const tokens: { text: string; unit: string; rect: DOMRect }[] = []
          const walker = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            // Only painted text makes up a rendered line; visually hidden words are for screen readers.
            if (node.parentElement!.closest('.sr-only')) continue
            const text = node.textContent ?? ''
            const unit = node.parentElement!.closest('.count') ? 'count' : node.parentElement!.closest('[data-letter]') ? 'letters' : 'other'
            for (let k = 0; k < text.length; k++) {
              if (!text[k].trim()) continue
              const range = document.createRange()
              range.setStart(node, k)
              range.setEnd(node, k + 1)
              for (const rect of range.getClientRects()) tokens.push({ text: text[k], unit, rect })
            }
          }
          for (const sep of meta.querySelectorAll('.sep')) for (const rect of sep.getClientRects()) if (rect.width > 0.5) tokens.push({ text: '/', unit: 'other', rect })
          // Tokens whose vertical centres sit within half a token of each other share a line.
          const lines: (typeof tokens)[] = []
          for (const token of [...tokens].sort((a, b) => a.rect.top + a.rect.height / 2 - (b.rect.top + b.rect.height / 2))) {
            const centre = token.rect.top + token.rect.height / 2
            const line = lines.find((items) => Math.abs(items[0].rect.top + items[0].rect.height / 2 - centre) < token.rect.height / 2)
            if (line) line.push(token)
            else lines.push([token])
          }
          const rendered = lines.map((line) => line.sort((a, b) => a.rect.left - b.rect.left))
          const linesOf = (unit: string) => new Set(rendered.flatMap((line, position) => (line.some((token) => token.unit === unit) ? [position] : []))).size
          return {
            summit: meta.closest<HTMLElement>('.summit')!.dataset.summit!,
            lines: rendered.map((line) => line.map((token) => token.text).join('')),
            countLines: linesOf('count'),
            letterLines: linesOf('letters'),
          }
        }),
      )
      for (const meta of report) {
        for (const line of meta.lines) {
          expect(line.startsWith('/'), `${meta.summit}: "${line}"`).toBe(false)
          expect(line.endsWith('/'), `${meta.summit}: "${line}"`).toBe(false)
        }
        expect(meta.countLines, `${meta.summit} count on one line`).toBe(1)
        expect(meta.letterLines, `${meta.summit} letters on one line`).toBeLessThanOrEqual(1)
      }
    })
  }

  // On a tablet the tall drawing is capped in width, so the sheet stays a readable height, and its
  // field still covers the whole cell.
  for (const width of [520, 768, 860]) test(`the tall drawing stays under 1.6 viewport heights at ${width} px and covers its cell`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 })
    await ready(page)
    const report = await page.evaluate(() => {
      const drawing = document.querySelector('.sheet-drawing')!.getBoundingClientRect()
      const svg = [...document.querySelectorAll('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!
      const box = svg.getBoundingClientRect()
      return {
        shape: svg.getAttribute('data-shape'),
        height: drawing.height,
        covered: box.top <= drawing.top + 0.5 && box.bottom >= drawing.bottom - 0.5 && box.left <= drawing.left + 0.5 && box.right >= drawing.right - 0.5,
        scroll: document.documentElement.scrollWidth,
      }
    })
    expect(report.shape).toBe('tall')
    expect(report.height).toBeLessThanOrEqual(1.6 * 1024)
    expect(report.covered).toBe(true)
    expect(report.scroll).toBe(width)
  })

  test('exactly one sheet drawing is displayed at each width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await ready(page)
    expect(await visibleDrawings(page)).toEqual(['wide'])
    await page.setViewportSize({ width: 390, height: 900 })
    expect(await visibleDrawings(page)).toEqual(['tall'])
    for (const svg of await page.locator('.sheet-drawing svg[data-shape]').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  // Uniform scaling: the shown drawing keeps its viewBox shape and every tag stays a circle.
  const shapeReport = (page: Page) =>
    page.evaluate(() => {
      const svg = [...document.querySelectorAll<SVGSVGElement>('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!
      const box = svg.viewBox.baseVal
      const rect = svg.getBoundingClientRect()
      const tags = [...document.querySelectorAll('#sheet .tag')].map((tag) => tag.getBoundingClientRect())
      return {
        drawn: rect.width / rect.height,
        viewBox: box.width / box.height,
        ovalTags: tags.filter((tag) => Math.abs(tag.width - tag.height) > 0.5).length,
        tags: tags.length,
      }
    })

  for (const [width, font] of [[320, ''], [390, ''], [390, '200%'], [768, ''], [900, ''], [1024, ''], [1280, ''], [1440, ''], [1280, '200%']] as const) {
    test(`the drawing scales uniformly at ${width} px${font ? ` with ${font} text` : ''}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      if (font) await page.evaluate((size) => (document.documentElement.style.fontSize = size), font)
      const report = await shapeReport(page)
      expect(Math.abs(report.drawn / report.viewBox - 1)).toBeLessThan(0.01)
      expect(report.tags).toBeGreaterThan(0)
      expect(report.ovalTags).toBe(0)
    })
  }

  // No empty band in the drawing cell: the drawing box runs down to the command line, and the
  // drawing covers the box.
  for (const width of [900, 1024, 1280, 1440]) {
    test(`the drawing fills its cell down to the command line at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await ready(page)
      const report = await page.evaluate(() => {
        const drawing = document.querySelector('.sheet-drawing')!.getBoundingClientRect()
        const svg = [...document.querySelectorAll('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!.getBoundingClientRect()
        const cmd = document.getElementById('sheet-cmd')!.getBoundingClientRect()
        const side = document.querySelector('#sheet .side')!.getBoundingClientRect()
        return {
          gap: cmd.top - drawing.bottom,
          covered: svg.top <= drawing.top + 0.5 && svg.bottom >= drawing.bottom - 0.5 && svg.left <= drawing.left + 0.5 && svg.right >= drawing.right - 0.5,
          columns: Math.abs(cmd.bottom - side.bottom),
        }
      })
      expect(Math.abs(report.gap)).toBeLessThanOrEqual(2)
      expect(report.covered).toBe(true)
      expect(report.columns).toBeLessThanOrEqual(2)
    })
  }

  test('the stage around the sheet uses the page ground in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await ready(page)
      const [stage, body] = await page.evaluate(() => [getComputedStyle(document.getElementById('stage')!).backgroundColor, getComputedStyle(document.body).backgroundColor])
      expect(stage, scheme).toBe(body)
    }
  })

  test('contours and trails follow a theme switch', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await ready(page)
    const strokes = () =>
      page.evaluate(() => {
        const svg = [...document.querySelectorAll('.sheet-drawing svg[data-shape]')].find((item) => item.checkVisibility())!
        return ['.contour', '.trail'].map((selector) => getComputedStyle(svg.querySelector(selector)!).stroke)
      })
    const light = await strokes()
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    const dark = await strokes()
    expect(dark[0]).not.toBe(light[0])
    expect(dark[1]).not.toBe(light[1])
  })
})

test.describe('sheet without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('without JavaScript, every summit links to its area and every proof link is reachable', async ({ page }) => {
    await page.goto('/')
    for (const domain of model.domains) {
      const summit = page.locator(`#sheet a.summit[data-summit="${domain.id}"]`)
      await expect(summit).toBeVisible()
      await expect(summit).toHaveAttribute('href', `#area-${domain.id}`)
      await expect(page.locator(`#area-${domain.id}`)).toBeVisible()
      await expect(page.locator(`#area-${domain.id}`)).toContainText(domain.name)
    }
    for (const proof of model.proofs.filter((item) => item.href)) {
      await expect(page.locator(`#stage ol.index a[href="${proof.href}"]`).first(), proof.id).toBeVisible()
    }
    await expect(page.locator('#sheet-cmd')).toBeHidden()
    await expect(page.locator('#sheet .materials li[data-material] button')).toHaveCount(0)
    // The readout is the island's; without it there is no empty strip and no empty region.
    await expect(page.locator('#readout')).toBeHidden()
    expect(await page.locator('#readout').evaluate((readout) => readout.getBoundingClientRect().height)).toBe(0)
  })
})

// The js class is set before first paint, but the island can still fail before it is ready. Until
// then each summit must keep pointing at a list the reader can see.
test.describe('sheet when the island never gets ready', () => {
  test('the static list under the sheet stays visible', async ({ page }) => {
    // The island is Stage.astro's script: it loads, so the js class stays, but it never runs.
    await page.route('**/_astro/Stage.astro*.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/\bjs\b/)
    await page.waitForLoadState('load')
    expect(await page.locator('html').getAttribute('data-island')).toBeNull()
    for (const domain of model.domains) await expect(page.locator(`#area-${domain.id}`), domain.id).toBeVisible()
  })
})

test('the home page HTML is at most 40 KB gzip', () => {
  const html = readFileSync(join(process.cwd(), 'dist', 'index.html'))
  expect(gzipSync(html, { level: 9 }).length).toBeLessThanOrEqual(40_000)
})

test.describe('number keys', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('pressing 1 to 5 on the home page changes nothing', async ({ page }) => {
    await ready(page)
    const before = { scroll: await page.evaluate(() => window.scrollY), sheet: await page.locator('#sheet').innerHTML() }
    for (const key of ['1', '2', '3', '4', '5']) await page.keyboard.press(key)
    expect(await page.evaluate(() => window.scrollY)).toBe(before.scroll)
    expect(await page.locator('#sheet').innerHTML()).toBe(before.sheet)
  })
})
