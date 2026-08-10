import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '@/context/I18nContext'
import { pushOverlay } from '@/lib/nativeBootstrap'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FoodEntrySheet } from '@/components/dashboard/FoodEntrySheet'
import { MACROS } from '@/lib/constants'
import { caloriesForServings, round, scaleMacros, type MacroGrams } from '@/lib/macros'
import { deleteFoodLog, updateLogServings } from '@/lib/foods'
import type { FoodLogWithFood } from '@/lib/database.types'

/** How long a press has to be held before it becomes a long press. */
const LONG_PRESS_MS = 420
/** Movement past this turns the press into a scroll and cancels the long press. */
const LONG_PRESS_SLOP_PX = 8
/** Roughly the menu's height — the room it needs under the row to open downward. */
const MENU_HEIGHT_PX = 168
/** Bottom nav plus its inset: space under the row that is not really free. */
const BOTTOM_CHROME_PX = 96

/**
 * One logged food inside a meal card.
 *
 * The whole row is the target: tapping it opens {@link FoodEntrySheet}, holding
 * it opens a context menu with the same three actions. The row used to carry
 * four ~28px icon buttons at its right edge instead, which on a phone were
 * neither reliably hittable nor discoverable — they had no labels, and the same
 * strip was hidden until hover on desktop, so the row's actions were invisible
 * at every width.
 *
 * The menu is the iOS press-and-hold idiom rather than a swipe: swipe competes
 * with the page's own vertical scroll, and a menu can name its actions where a
 * revealed icon cannot. Right-click and the keyboard menu key reach it too —
 * both fire `contextmenu` — so the actions are not touch-only.
 */
export function FoodLogRow({
  log,
  onChanged,
  onCopy,
  onNotice,
}: {
  log: FoodLogWithFood
  onChanged: () => void
  onCopy: () => void
  /** Confirms an action whose only other feedback is the list quietly changing. */
  onNotice: (message: string) => void
}) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAbove, setMenuAbove] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rowRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout>>()
  const pressOrigin = useRef({ x: 0, y: 0 })
  const longPressFired = useRef(false)

  const loggedAmount = round(log.servings * log.food.serving_amount, 2)
  const scaled = scaleMacros(log.food, log.servings)
  const kcal = caloriesForServings(log.food, log.servings)

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    // See Modal: Android sends no Escape, so back must find this too.
    const unregister = pushOverlay(close)
    // The menu key opens this as readily as a long press does, so give the
    // first item focus — otherwise a keyboard user gets a menu they can't reach.
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      unregister()
    }
  }, [menuOpen])

  function openMenu() {
    const rect = rowRef.current?.getBoundingClientRect()
    // Flip above the row when what is left below it — the viewport minus the
    // phone's bottom chrome — cannot hold the menu.
    const room = rect ? window.innerHeight - rect.bottom - BOTTOM_CHROME_PX : Infinity
    setMenuAbove(room < MENU_HEIGHT_PX)
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
    setSheetOpen(true)
  }

  async function saveServings(servings: number) {
    setBusy(true)
    setError(null)
    try {
      await updateLogServings(log.id, servings)
      setSheetOpen(false)
      onNotice(t('dashboard.quantityUpdated'))
      onChanged()
    } catch {
      setError(t('dashboard.couldNotUpdateEntry'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteFoodLog(log.id)
      setConfirming(false)
      setSheetOpen(false)
      onNotice(t('dashboard.entryDeleted'))
      onChanged()
    } catch {
      setConfirming(false)
      setError(t('dashboard.couldNotDeleteEntry'))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Lifting the whole row above the page while its menu is open is what puts
    // it in front of the scrim; the scrim is a plain sibling underneath it.
    <div className={`relative ${menuOpen ? 'z-[60]' : ''}`}>
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
        aria-haspopup="dialog"
        className={`relative flex min-h-[58px] w-full select-none items-center gap-3 rounded-row p-sm px-3 text-left transition-all [-webkit-touch-callout:none] glass-row ${
          menuOpen
            ? 'scale-[1.03] shadow-card-hover'
            : 'hover:brightness-[1.04]'
        }`}
      >
        {/* The dot is the dominant macro. It carries a halo of its own colour
            so it stays legible against the row's translucent fill, which can
            sit over any part of the aurora. */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dominantColor(scaled),
            boxShadow: `0 0 0 3px color-mix(in srgb, ${dominantColor(scaled)} 22%, transparent)`,
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-body-md text-body-md font-semibold text-on-surface">
            {log.food.name}
          </span>
          {/* Amount and macros share one line: at phone width the right-hand
              column has room for the calories and nothing else. */}
          <span className="mt-0.5 flex items-center gap-sm text-xs text-on-surface-variant">
            <span className="shrink-0">
              {loggedAmount} {log.food.serving_unit}
            </span>
            {MACROS.map((m) => (
              <span key={m.key} className="flex shrink-0 items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                {round(scaled[m.field])}g
              </span>
            ))}
          </span>
        </span>
        <span className="w-16 shrink-0 text-right font-label-md text-label-md text-on-surface">
          {t('dashboard.mealKcal', { kcal: Math.round(kcal) })}
        </span>
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('dashboard.entryOptions')}
          className={`animate-menu-pop absolute left-2 z-20 w-[232px] divide-y divide-[color:var(--glass-row-border)] overflow-hidden rounded-lens shadow-card-hover glass ${
            menuAbove ? 'bottom-full mb-sm origin-bottom-left' : 'top-full mt-sm origin-top-left'
          }`}
        >
          <MenuItem
            icon="info"
            label={t('dashboard.entryDetails')}
            onSelect={() => {
              setMenuOpen(false)
              setSheetOpen(true)
            }}
          />
          <MenuItem
            icon="content_copy"
            label={t('foodInfo.copyFood')}
            onSelect={() => {
              closeMenu()
              onCopy()
            }}
          />
          <MenuItem
            icon="delete"
            label={t('common.delete')}
            destructive
            onSelect={() => {
              setMenuOpen(false)
              setConfirming(true)
            }}
          />
        </div>
      )}

      {error && !sheetOpen && <p className="px-sm pt-1 font-body-md text-xs text-error">{error}</p>}

      <FoodEntrySheet
        open={sheetOpen}
        food={log.food}
        servings={log.servings}
        saving={busy}
        error={sheetOpen ? error : null}
        onClose={() => {
          setError(null)
          setSheetOpen(false)
        }}
        onSave={saveServings}
        onCopy={() => {
          setSheetOpen(false)
          onCopy()
        }}
        onDelete={() => setConfirming(true)}
      />

      <ConfirmDialog
        open={confirming}
        title={t('dashboard.deleteEntryTitle')}
        message={t('dashboard.deleteEntryConfirm', {
          name: log.food.name,
          amount: loggedAmount,
          unit: log.food.serving_unit,
        })}
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
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
          : 'text-on-surface hover:bg-[color:var(--glass-chip-hover)]'
      }`}
    >
      {label}
      <Icon name={icon} className="shrink-0 text-[20px]" />
    </button>
  )
}

/** Dominant-macro color for the leading dot; outline-variant when there is none. */
function dominantColor(m: MacroGrams): string {
  const entries = MACROS.map((meta) => ({ meta, val: m[meta.field] }))
  entries.sort((a, b) => b.val - a.val)
  return entries[0].val > 0 ? entries[0].meta.color : 'rgb(var(--outline-variant))'
}
