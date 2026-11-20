// Makes aria-modal true in fact: while a dialog is open, every other top-level region of <body>
// is inert. Dialogs stack (the palette can open over the drawer); only the top one stays live.
// Elements marked data-modal manage their own closed state and are inert whenever not on top;
// the live region stays out of this so announcements still reach assistive tech.
const stack: HTMLElement[] = []
const openSubscribers = new Set<(dialog: HTMLElement) => void>()

// Told whenever a dialog comes to the top, so motion that should not run under it can stop.
export function onModalOpen(cb: (dialog: HTMLElement) => void): () => void {
  openSubscribers.add(cb)
  return () => openSubscribers.delete(cb)
}

function apply(): void {
  const top = stack[stack.length - 1]
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || child.tagName === 'SCRIPT' || child.hasAttribute('data-live')) continue
    if (child === top) child.inert = false
    else if (child.hasAttribute('data-modal') && !stack.includes(child)) child.inert = true
    else child.inert = top !== undefined
  }
}

export function pushModal(dialog: HTMLElement): void {
  const position = stack.indexOf(dialog)
  if (position >= 0) stack.splice(position, 1)
  stack.push(dialog)
  apply()
  for (const cb of openSubscribers) cb(dialog)
}

export function popModal(dialog: HTMLElement): void {
  const position = stack.indexOf(dialog)
  if (position >= 0) stack.splice(position, 1)
  apply()
}
