import { useCallback } from 'react'

/**
 * Arrow-key navigation for a `role="radiogroup"` built out of buttons.
 *
 * Two places do this — the appearance switch on Profile, the reminder interval
 * on the hydration settings — and both announced themselves as radio groups
 * while behaving like a row of unrelated buttons. That gap is the problem: a
 * screen reader tells the user "radio group, 3 items, 1 of 3", and the keys
 * that promise implies (arrows to move, one Tab stop for the whole group) did
 * nothing. Tab still worked, so the control was reachable — it just wasn't the
 * control the user had been told they were on.
 *
 * The group is one Tab stop. That is the other half of the pattern, and it is
 * the caller's to apply: give the checked option `tabIndex={0}` and the rest
 * `tabIndex={-1}` (see {@link radioTabIndex}). Otherwise a three-option group
 * costs three Tab presses to walk past.
 *
 * Arrows both move focus *and* select, which is what the WAI-ARIA radio group
 * pattern specifies — a radio group has no "focused but unchosen" state.
 * Selecting is the caller's `onSelect`, because for these two groups that also
 * means a write to the profile.
 */
export function useRadioGroupKeys<T>(options: readonly T[], onSelect: (option: T) => void) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      const home = e.key === 'Home'
      const end = e.key === 'End'
      if (!forward && !back && !home && !end) return

      const radios = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'),
      )
      const at = radios.indexOf(document.activeElement as HTMLElement)
      if (at < 0 || radios.length === 0) return

      e.preventDefault()
      // Wraps in both directions, per the pattern: right off the last option
      // returns to the first.
      const next = home
        ? 0
        : end
          ? radios.length - 1
          : (at + (forward ? 1 : radios.length - 1)) % radios.length

      radios[next].focus()
      // The DOM order of the rendered radios is the order of `options`, so the
      // index carries across. A disabled option is filtered out of both — the
      // two callers disable the whole group or none of it.
      const picked = options[next]
      if (picked !== undefined) onSelect(picked)
    },
    [options, onSelect],
  )
}

/** One Tab stop per group: the chosen option holds it. */
export function radioTabIndex(checked: boolean): 0 | -1 {
  return checked ? 0 : -1
}
