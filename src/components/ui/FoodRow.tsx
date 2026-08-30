import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useOverlayDismiss } from '@/hooks/useOverlayDismiss'
import { Icon } from '@/components/ui/Icon'
import { MACROS } from '@/lib/constants'
import { round, type MacroGrams } from '@/lib/macros'

/** How long a press has to be held before it becomes a long press. */
const LONG_PRESS_MS = 420
/** Movement past this turns the press into a scroll and cancels the long press. */
const LONG_PRESS_SLOP_PX = 8
/**
 * Roughly one menu item, for deciding which way the menu opens.
 *
 * An estimate rather than a measurement, because the decision has to be made
 * before the menu exists. A 24px line at `py-3` plus its divider rounds up to
 * this, and erring high only means opening upward slightly sooner than needed —
 * where erring low would open a menu that runs off the bottom of the screen.
 */
const MENU_ITEM_PX = 56
/** Bottom nav plus its inset: space under the row that is not really free. */
const BOTTOM_CHROME_PX = 96

export interface FoodRowAction {
  /** Material Symbols name. */
  icon: string
  label: string
  destructive?: boolean
  onSelect: () => void
}

/**
 * A food, as a row: the shape used both for a logged entry inside a meal card
 * and for an entry in My Foods.
 *
 * The whole row is the target — tapping it runs `onActivate`, holding it opens
 * a menu of `actions`. The alternative both lists started from was a strip of
 * ~28px icon buttons at the right edge, which on a phone were neither reliably
 * hittable nor discoverable: they carried no labels, and on desktop the same
 * strip was hidden until hover, so a row's actions were invisible at every
 * width. My Foods still had that strip; this is what replaced it.
 *
 * The menu is the iOS press-and-hold idiom rather than a swipe: swipe competes
 * with the page's own vertical scroll, and a menu can name its actions where a
 * revealed icon cannot. Right-click and the keyboard menu key reach it too —
 * both fire `contextmenu` — so the actions are not touch-only.
 *
 * The caller owns whatever the row opens (a sheet, a confirm dialog) and
 * renders it as a sibling; those are all `position: fixed`, so they do not care
 * where in the tree they sit, and keeping them out here is what lets one row
 * serve two lists with different actions behind it.
 */
export function FoodRow({
  name,
  amount,
  macros,
  kcalLabel,
  badge,
  menuLabel,
  onActivate,
  actions,
}: {
  name: string
  /** The served quantity, already formatted — "200 g". */
  amount: string
  /** Macros for the amount shown, not per serving. */
  macros: MacroGrams
  /** Calories with their unit, formatted by the caller — the word is translated. */
  kcalLabel: string
  /** Optional marker before the amount — My Foods flags custom vs imported. */
  badge?: { icon: string; label: string }
  /** Accessible name for the menu. */
  menuLabel: string
  onActivate: () => void
  actions: FoodRowAction[]
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAbove, setMenuAbove] = useState(false)

  const rowRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const longPressFired = useRef(false)

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  useEffect(() => {
    if (!menuOpen) return
    // The menu key opens this as readily as a long press does, so give the
    // first item focus — otherwise a keyboard user gets a menu they can't reach.
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [menuOpen])

  // Escape here, and Android's back, close only this menu — the shared stack
  // makes sure they don't also take down whatever the row sits inside.
  useOverlayDismiss(menuOpen, closeMenu)

  /**
   * Arrow keys walk the menu, Home/End jump to its ends.
   *
   * `role="menu"` is a promise that they do: a screen reader tells the user
   * this is a menu, and the menu pattern is arrow-driven — Tab is expected to
   * *leave* it, not to step through it. Without this the announcement was
   * describing a widget the app didn't implement.
   */
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : // Wraps, as the menu pattern specifies: down off the last item
            // returns to the first.
            (at + (e.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length
    items[next].focus()
  }

  function openMenu() {
    const rect = rowRef.current?.getBoundingClientRect()
    // Flip above the row when what is left below it — the viewport minus the
    // phone's bottom chrome — cannot hold the menu.
    const room = rect ? window.innerHeight - rect.bottom - BOTTOM_CHROME_PX : Infinity
    setMenuAbove(room < actions.length * MENU_ITEM_PX)
    setMenuOpen(true)
  }

  function closeMenu() {
    setMenuOpen(false)
    rowRef.current?.focus()
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    // Secondary buttons go through onContextMenu instead, and a second finger
    // must not restart a press that is already being tracked.
    if (menuOpen || !e.isPrimary || e.button !== 0) return
    longPressFired.current = false
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      // The only signal that the hold "took" before the menu paints. Silently
      // absent on iOS, which exposes no vibration API to a web view.
      if (typeof navigator.vibrate === 'function') navigator.vibrate(8)
      openMenu()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const moved = Math.hypot(e.clientX - pressOrigin.current.x, e.clientY - pressOrigin.current.y)
    if (moved > LONG_PRESS_SLOP_PX) clearTimeout(pressTimer.current)
  }

  function handleClick() {
    // The pointerup that ends a long press still fires a click on the button.
    if (longPressFired.current) return
    if (menuOpen) {
      closeMenu()
      return
    }
    onActivate()
  }

  return (
    // Lifting the whole row above the page while its menu is open is what puts
    // it in front of the scrim; the scrim is a plain sibling underneath it.
    <div className={`relative ${menuOpen ? 'z-60' : ''}`}>
      {menuOpen && (
        <div
          aria-hidden="true"
          onClick={closeMenu}
          className="animate-overlay-fade-in fixed inset-0 touch-none glass-scrim"
        />
      )}

      <button
        ref={rowRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => clearTimeout(pressTimer.current)}
        onPointerCancel={() => clearTimeout(pressTimer.current)}
        onPointerLeave={() => clearTimeout(pressTimer.current)}
        onContextMenu={(e) => {
          // Both the native long-press callout and the desktop right-click menu
          // would otherwise land on top of this one.
          e.preventDefault()
          if (!menuOpen) openMenu()
        }}
        onClick={handleClick}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`settle relative flex min-h-[58px] w-full select-none items-center gap-3 rounded-row p-sm px-3 text-left [-webkit-touch-callout:none] glass-row ${
          menuOpen ? 'scale-[1.03] shadow-card-hover' : 'hover:brightness-[1.04]'
        }`}
      >
        {/* The dot is the dominant macro. It carries a halo of its own colour
            so it stays legible against the row's translucent fill, which can
            sit over any part of the aurora. */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dominantColor(macros),
            boxShadow: `0 0 0 3px color-mix(in srgb, ${dominantColor(macros)} 22%, transparent)`,
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-body-md text-body-md font-semibold text-on-surface">
            {name}
          </span>
          {/* Amount and macros share one line: at phone width the right-hand
              column has room for the calories and nothing else. They wrap
              rather than run off it — five shrink-0 chips at 200% text are
              wider than a 320px phone, and the row has no scroll of its own to
              reach what falls past the edge. */}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-sm gap-y-0.5 text-xs text-on-surface-variant">
            {badge && (
              <span className="flex shrink-0 items-center" title={badge.label}>
                {/* Sized inline rather than with `text-[0.875rem]`, which would do
                    nothing: `.material-symbols-outlined` sets font-size and is
                    declared after `@tailwind utilities` in index.css, so it
                    beats every text-* utility on an icon — app-wide, not only
                    here. Moving that rule is the real fix and resizes every
                    icon in the app, so it is not this component's to make.
                    In rem, not px, for the same reason as everything else: a
                    glyph pinned at 14px beside a label the reader has scaled
                    to 28px reads as a rendering fault. */}
                <Icon name={badge.icon} style={{ fontSize: '0.875rem' }} />
                <span className="sr-only">{badge.label}</span>
              </span>
            )}
            <span className="shrink-0">{amount}</span>
            {MACROS.map((m) => (
              <span key={m.key} className="flex shrink-0 items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                {round(macros[m.field])}g
              </span>
            ))}
          </span>
        </span>
        <span className="w-16 shrink-0 text-right font-label-md text-label-md text-on-surface">
          {kcalLabel}
        </span>
      </button>

      {menuOpen && (
        // `glass-menu`, not `glass`: this is the one lens that covers the app's
        // own content rather than the page ground, and `glass` cannot blur what
        // is behind it in a Chromium WebView. See the note in index.css.
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={handleMenuKeyDown}
          className={`animate-menu-pop absolute left-2 z-20 w-[14.5rem] max-w-[calc(100vw-2rem)] divide-y divide-(--glass-row-border) overflow-hidden rounded-lens glass-menu ${
            menuAbove ? 'bottom-full mb-sm origin-bottom-left' : 'top-full mt-sm origin-top-left'
          }`}
        >
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              icon={action.icon}
              label={action.label}
              destructive={action.destructive}
              onSelect={() => {
                // Closing without returning focus: every action either opens
                // something that takes focus itself or removes the row, and
                // focusing a row that is about to unmount fights both.
                setMenuOpen(false)
                action.onSelect()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  destructive = false,
  onSelect,
}: {
  icon: string
  label: string
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-sm px-md py-3 text-left font-body-md text-body-md transition-colors ${
        destructive
          ? 'text-error hover:bg-error-container/60'
          : 'text-on-surface hover:bg-(--glass-chip-hover)'
      }`}
    >
      {label}
      <Icon name={icon} className="shrink-0 text-[1.25rem]" />
    </button>
  )
}

/** Dominant-macro color for the leading dot; outline-variant when there is none. */
function dominantColor(m: MacroGrams): string {
  const entries = MACROS.map((meta) => ({ meta, val: m[meta.field] }))
  entries.sort((a, b) => b.val - a.val)
  return entries[0].val > 0 ? entries[0].meta.color : 'rgb(var(--outline-variant))'
}
