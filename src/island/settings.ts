// Site settings on every page: the theme control.
// Each control on the page (the home bar, the footer) is wired here, so they stay in step with each
// other and with the palette's entries.
import { THEMES, currentTheme, onThemeChange, setTheme } from './state'

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

bindThemeControls()
