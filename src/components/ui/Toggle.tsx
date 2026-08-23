/**
 * A switch. The app had no toggle primitive — every setting so far has been a
 * select or a text field — so this is the first one.
 *
 * It is a real `<button role="switch">` rather than a styled checkbox so that
 * `aria-checked` carries the state and tests can find it by role and name, the
 * way every other control here is queried.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  describedBy,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name. Visible text should be rendered by the caller. */
  label: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // The track is drawn 28px tall because that is what the settings rows
      // want it to look like; `tap-target` gives it the 44px a finger needs
      // without changing that, and without shifting the rows it sits in.
      className={`tap-target relative inline-flex h-[28px] w-2xl shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-primary' : 'bg-outline-variant'
      }`}
    >
      <span
        className={`inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-xs transition-transform dark:bg-on-surface ${
          checked ? 'translate-x-lg' : 'translate-x-[4px]'
        }`}
      />
    </button>
  )
}
