import { useEffect, useRef } from 'react'
import { pushOverlay } from '@/lib/nativeBootstrap'

/**
 * The two ways out of an overlay that aren't a button: Escape, and Android's
 * hardware back.
 *
 * Both are the same gesture wearing different clothes — "close the thing on
 * top" — and both have to agree on which thing that is. Back already did:
 * `pushOverlay` keeps a stack and pops one. Escape did not. Every overlay
 * registered its own `keydown` on `window`, so one press ran all of them, and a
 * confirm dialog opened over the food sheet took the sheet down with it when
 * you cancelled. You lost the entry you were editing to a keypress that means
 * "never mind".
 *
 * Stacking Escape the same way is what this is for. It is the only dismiss path
 * a keyboard user has on the web, and the WAI-ARIA dialog pattern is explicit
 * that it closes *the* dialog, not the stack it sits in.
 *
 * The callback is read through a ref, so a caller passing an inline arrow does
 * not tear the listener down and re-register it on every render — which would
 * quietly shuffle that overlay to the top of the stack.
 */
type Entry = { current: () => void }

const escapeStack: Entry[] = []

let listening = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const top = escapeStack[escapeStack.length - 1]
  if (!top) return
  // Stop here so nothing further down — another overlay, a page-level handler —
  // also treats this press as its own.
  e.stopPropagation()
  e.preventDefault()
  top.current()
}

export function useOverlayDismiss(active: boolean, onDismiss: () => void) {
  // One box per hook instance, kept current by the effect below. Its identity
  // is this overlay's place in the stack, so it must not be recreated.
  const entry = useRef<Entry>({ current: onDismiss })

  // In an effect rather than during render: writing a ref while rendering is
  // a side effect, and under a render React discards or replays it would be
  // applied for a tree that never commits. No dependency array — the point is
  // to track the latest callback on every commit.
  useEffect(() => {
    entry.current.current = onDismiss
  })

  useEffect(() => {
    if (!active) return
    const self = entry.current

    escapeStack.push(self)
    if (!listening) {
      // Capture phase, so the overlay is dismissed before anything inside it
      // gets to treat Escape as its own (an open `<select>`, say).
      window.addEventListener('keydown', onKeyDown, true)
      listening = true
    }

    const unregisterBack = pushOverlay(() => self.current())

    return () => {
      const i = escapeStack.lastIndexOf(self)
      if (i >= 0) escapeStack.splice(i, 1)
      if (escapeStack.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown, true)
        listening = false
      }
      unregisterBack()
    }
  }, [active])
}
