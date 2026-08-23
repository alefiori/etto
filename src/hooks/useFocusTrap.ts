import { useEffect, type RefObject } from 'react'

/**
 * Keeps keyboard focus inside an open overlay, and gives it back when the
 * overlay closes.
 *
 * Every dialog in the app already carries `aria-modal="true"`, which is what
 * confines a *screen reader* to it — VoiceOver and TalkBack both honour it, so
 * swiping never wanders into the page behind. It does nothing for Tab: without
 * this, the third press of Tab inside a bottom sheet lands on the tab bar
 * underneath it, and the sheet is still covering the thing that now has focus.
 * The two mechanisms are separate and both are required.
 *
 * Three jobs, in order:
 *
 *  - **Remember** what had focus when the overlay opened, so it can be handed
 *    back. Not the overlay's business who that was — it is whatever the user
 *    was on, and returning them there is what makes Escape feel like a cancel
 *    rather than a reset.
 *  - **Enter**. Focus moves to the first element marked `data-autofocus`, else
 *    the first tabbable one, else the container itself. The container is given
 *    `tabindex="-1"` for that last case, which is also what makes a screen
 *    reader announce the dialog's title on open. If something inside already
 *    has focus — React's own `autoFocus` runs before this effect — it is left
 *    alone.
 *  - **Cycle**. Tab off the end wraps to the start, Shift+Tab off the start
 *    wraps to the end.
 *
 * Overlays stack (a confirm dialog over a sheet over a modal), so only the
 * topmost trap handles the key. The stack is module scope, the same shape as
 * the lock count in {@link useScrollLock} and the back-button stack in
 * lib/nativeBootstrap.
 */

/** Focusable things, minus the ones a Tab press would skip anyway. */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'video[controls]',
  'audio[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

const trapStack: HTMLElement[] = []

/**
 * The last control touched outside any overlay — i.e. whatever opened the one
 * that is on screen now.
 *
 * Tracked continuously rather than read when the trap activates, because by
 * then it is already too late. React applies `autoFocus` during commit, before
 * effects run, so an overlay that autofocuses a field (the Add Food search, the
 * custom-food name) has *already* moved focus into itself by the time this hook
 * gets to look — and the trap would dutifully "restore" focus to a field inside
 * the sheet it just closed, which is to say: nowhere, once that sheet unmounts.
 *
 * Two signals, because focus alone is not enough. `focusin` covers the keyboard
 * user, who tabbed to the button and pressed Enter. It does *not* reliably
 * cover the mouse user: whether clicking a `<button>` focuses it is a
 * platform-and-engine question, and on macOS the answer is often no — which is
 * how a pointer user ended up back on `<body>` with the tab bar behind them.
 * `pointerdown` catches that case by recording the nearest focusable ancestor
 * of whatever was pressed.
 *
 * Registered at module load, which is app start: it has to be listening before
 * the first overlay opens, and no overlay can arrange that for itself.
 */
let lastFocusedOutside: HTMLElement | null = null

/**
 * Any overlay, whether or not its trap has registered yet.
 *
 * The trap registers in an effect, which is a beat *after* React has committed
 * the overlay's DOM and applied its `autoFocus`. In that gap `trapStack` is
 * still empty, so a stack check alone would see the newly focused field as
 * "outside" and record it as the thing to return to — the exact element that is
 * about to be destroyed. Matching on the roles closes the gap.
 */
const OVERLAY = '[aria-modal="true"],[role="dialog"],[role="alertdialog"],[role="menu"]'

function rememberIfOutside(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return
  // A press on a label or an icon inside a button should remember the button.
  const focusable = target.closest<HTMLElement>(TABBABLE) ?? target
  // Interaction *within* an overlay says nothing about where to return to.
  if (focusable.closest(OVERLAY)) return
  if (trapStack.some((container) => container.contains(focusable))) return
  lastFocusedOutside = focusable
}

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => rememberIfOutside(e.target), true)
  document.addEventListener('pointerdown', (e) => rememberIfOutside(e.target), true)
}

/**
 * Tabbable descendants in document order.
 *
 * `offsetParent` is the cheap "is this actually on screen" test: it is null for
 * anything inside a `display: none` subtree, which is how the app hides the
 * halves of the Add Food modal that the current width isn't showing. Without
 * it, Tab inside that modal on a phone would walk the hidden search column.
 * `position: fixed` elements report no offsetParent either, hence the fallback
 * to a measured rect.
 */
function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      el.offsetParent !== null ||
      el.getClientRects().length > 0 ||
      getComputedStyle(el).position === 'fixed',
  )
}

export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    // Not `document.activeElement`: an overlay with `autoFocus` has already
    // taken focus by now. See lastFocusedOutside.
    const restoreTo =
      lastFocusedOutside && !container.contains(lastFocusedOutside)
        ? lastFocusedOutside
        : document.activeElement
    trapStack.push(container)

    // So focus has somewhere to land when the overlay opens with no control in
    // it — a message-only alert — and so the title is announced on entry.
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')

    // Let React's `autoFocus` win where a component has already expressed a
    // preference; only place focus when it is still outside.
    if (!container.contains(document.activeElement)) {
      const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
      ;(preferred ?? tabbablesIn(container)[0] ?? container).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      // Only the topmost overlay cycles; the ones underneath are covered.
      if (e.key !== 'Tab' || trapStack[trapStack.length - 1] !== container) return
      const items = tabbablesIn(container!)
      if (items.length === 0) {
        // Nothing to move to, so Tab must not escape to the page behind.
        e.preventDefault()
        container!.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement

      // Focus sitting on the container itself (or knocked outside by a
      // click on the backdrop) has no position in the cycle — put it at
      // whichever end the key is heading for.
      if (!current || current === container || !container!.contains(current)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && current === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const i = trapStack.lastIndexOf(container)
      if (i >= 0) trapStack.splice(i, 1)
      // Only give focus back to something still in the document — the row that
      // opened a delete dialog is routinely gone by the time it closes, and
      // focusing a detached node silently drops focus onto <body>.
      if (restoreTo instanceof HTMLElement && restoreTo.isConnected) restoreTo.focus()
    }
  }, [active, containerRef])
}
