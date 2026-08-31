import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SettingsIcon } from '@/components/profile/SettingsIcon'

/**
 * A setting, as a row you open rather than a block you scroll past.
 *
 * The Profile page had nine sections, every one of them fully expanded, every
 * one of them at the same weight: nine headings, nine descriptions and every
 * field, picker and toggle the app owns, in one column. Finding the water goal
 * meant reading the meals editor on the way. The Grove artboard draws these as
 * rows instead — icon, name, current value, chevron — and that is the shape a
 * settings list has for a reason: the page becomes a table of contents you can
 * take in at a glance, and the section you came for is one tap away.
 *
 * What each row carries is the answer, not the control: "Language · English",
 * "Meals · 4". A row you can read without opening is a row you often don't have
 * to open.
 *
 * Standard disclosure semantics, not a hand-rolled one: the trigger is a real
 * button inside the heading it replaces (so heading navigation still lists
 * every section), `aria-expanded` says which state it is in, `aria-controls`
 * points at the panel, and the panel is genuinely absent when closed rather
 * than hidden — a screen reader should not be able to reach fields the eye
 * cannot see.
 *
 * `badge` is for the Pro pill, `busy` for a section saving in the background.
 * Both belong on the row rather than inside the panel, because both are things
 * you want to know *before* deciding to open it.
 */
export function SettingsRow({
  icon,
  label,
  value,
  badge,
  busy,
  children,
}: {
  /** Material Symbol for the leading tile. Must be in the shipped subset. */
  icon: string
  label: string
  /** The current setting, short enough to sit at the end of the row. */
  value?: ReactNode
  badge?: ReactNode
  busy?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="flex flex-col">
      {/* `h3` for the outline, `button` for the behaviour. The heading has no
          styling of its own — everything visual is on the button, which is what
          fills the row. */}
      <h3 className="contents">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="settle -mx-2 flex items-center gap-sm rounded-row px-2 py-2 text-left hover:bg-(--glass-chip-hover)"
        >
          <SettingsIcon name={icon} />
          <span className="min-w-0 flex-1 font-label-md text-label-md text-on-surface">{label}</span>
          {badge}
          {busy}
          {value != null && (
            <span className="min-w-0 shrink truncate font-label-md text-label-md text-on-surface-variant">
              {value}
            </span>
          )}
          {/* Rotates rather than swapping glyph: one icon, and the turn is what
              says the row moved rather than the page changing under you. */}
          <Icon
            name="chevron_right"
            className={`shrink-0 text-outline transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
        </button>
      </h3>

      {open && (
        <div id={panelId} className="flex flex-col gap-sm pb-sm pt-xs">
          {children}
        </div>
      )}
    </div>
  )
}
