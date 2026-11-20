// The bill of materials under the Plan drawing. The page renders it as static rows; with the island
// each row becomes a button that opens the drawer for that material.
import { el } from './dom'
import { onDrawerChange, openDrawer } from './drawer'

export function initBom(): void {
  const bom = document.querySelector<HTMLElement>('#stage .bom')
  if (!bom) throw new Error('bom: #stage .bom is missing')
  const buttons: HTMLButtonElement[] = []
  for (const item of bom.querySelectorAll<HTMLElement>('li[data-material]')) {
    const row = item.querySelector('.bom-row')
    const materialId = item.dataset.material
    if (!row || !materialId) throw new Error('bom: a row is missing its material')
    const button = el('button', { type: 'button', class: 'bom-row', 'data-material-open': materialId, 'aria-controls': 'drawer', 'aria-expanded': 'false' }, [
      ...row.childNodes,
    ])
    row.replaceWith(button)
    buttons.push(button)
  }
  bom.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-material-open]') : null
    if (button?.dataset.materialOpen) openDrawer({ materialId: button.dataset.materialOpen })
  })
  onDrawerChange((target) => {
    const open = target && 'materialId' in target ? target.materialId : null
    for (const button of buttons) button.setAttribute('aria-expanded', String(button.dataset.materialOpen === open))
  })
}
