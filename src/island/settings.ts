// Site settings on every page: the theme control and the switch for the single-key lens shortcuts.
// Each control on the page (the home bar, the footer) is wired here, so they stay in step with each
// other and with the palette's entries.
import { THEMES, currentTheme, onShortcutsChange, onThemeChange, setShortcutsEnabled, setTheme, shortcutsEnabled } from './state'

function bindThemeControls(): void {
  const controls = [...document.querySelectorAll<HTMLElement>('[data-theme-control]')]
  const label = () => {
    for (const control of controls) control.textContent = `Theme: ${currentTheme()}`
  }
  for (const control of controls) {
    control.addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]))
  }
  onThemeChange(label)
  label()
}

function bindShortcutControls(): void {
  const controls = [...document.querySelectorAll<HTMLElement>('[data-shortcuts-control]')]
  const show = (on: boolean) => {
    for (const control of controls) control.setAttribute('aria-pressed', String(on))
  }
  for (const control of controls) control.addEventListener('click', () => setShortcutsEnabled(!shortcutsEnabled()))
  onShortcutsChange(show)
  show(shortcutsEnabled())
}

bindThemeControls()
bindShortcutControls()
