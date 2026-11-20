// Provenance toggle: when on, every claim shows its source. The inline script in Base.astro
// applies a stored "on" before first paint; this module keeps the button and storage in step.
// Storage can throw (private mode, blocked site data); the choice then holds for this visit.
export const PROVENANCE_KEY = 'kp-provenance'

const root = document.documentElement

function store(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(PROVENANCE_KEY, 'on')
    else window.localStorage.removeItem(PROVENANCE_KEY)
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

function apply(button: HTMLElement, on: boolean): void {
  if (on) root.dataset.provenance = 'on'
  else delete root.dataset.provenance
  button.setAttribute('aria-pressed', String(on))
}

export function initProvenance(button: HTMLElement): void {
  apply(button, root.dataset.provenance === 'on')
  button.addEventListener('click', () => {
    const on = root.dataset.provenance !== 'on'
    apply(button, on)
    store(on)
  })
}

const button = document.getElementById('provenance-toggle')
if (button) initProvenance(button)
