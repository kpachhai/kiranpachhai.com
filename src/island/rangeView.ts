// The Range lens view toggle: areas x modes or roles x hats. Two pressed-state buttons above the
// stage, shown only in the Range lens; the choice holds for the session. Storage can throw.
import { currentView, setView, type RangeView } from './lenses/range'
import { relayout } from './stage'

export const RANGE_VIEW_KEY = 'kp-range-view'
// The matrix is drawn, so it is aria-hidden; the Journey lists each stop's hats as text.
const ANNOUNCE: Record<RangeView, string> = {
  areas: 'Range: areas x modes',
  roles: 'Range: roles x hats. Each Journey stop lists its hats.',
}

function storedView(): RangeView {
  try {
    return window.sessionStorage.getItem(RANGE_VIEW_KEY) === 'roles' ? 'roles' : 'areas'
  } catch {
    return 'areas'
  }
}

function remember(view: RangeView): void {
  try {
    window.sessionStorage.setItem(RANGE_VIEW_KEY, view)
  } catch {
    // Storage unavailable: the choice holds for this visit.
  }
}

// Call before the first lens is drawn, so a stored view is the one the Range lens first shows.
export function initRangeView(stage: HTMLElement, live: HTMLElement): void {
  const buttons = [...stage.querySelectorAll<HTMLButtonElement>('button[data-range-view]')]
  if (buttons.length !== 2) throw new Error('rangeView: the two view buttons are missing')
  const apply = (view: RangeView) => {
    setView(view)
    stage.dataset.rangeView = view
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.rangeView === view))
  }
  apply(storedView())
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const view: RangeView = button.dataset.rangeView === 'roles' ? 'roles' : 'areas'
      if (view === currentView()) return
      apply(view)
      remember(view)
      live.textContent = ANNOUNCE[view]
      void relayout()
    })
  }
}
