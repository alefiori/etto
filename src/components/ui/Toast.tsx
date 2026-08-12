import { Icon } from '@/components/ui/Icon'

/**
 * Transient confirmation for an action whose result is already visible — a row
 * that vanished, a number that changed. It floats rather than sitting in the
 * page flow because these actions are taken from anywhere in a long scrolling
 * day: a banner at the top of the dashboard confirms a deletion the user is not
 * looking at, and shifts the list under their thumb while they read it.
 *
 * On a phone it lands in the gap just above the floating tab bar, which now
 * carries the add button too and is the only chrome down there; from `md` up
 * neither exists and it settles into the bottom-right corner of the page.
 *
 * Renders nothing when `message` is null, so callers can keep it mounted and
 * drive it from a single piece of state.
 */
export function Toast({ message, icon = 'check_circle' }: { message: string | null; icon?: string }) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-overlay-fade-in fixed bottom-above-chrome left-container-margin-mobile right-container-margin-mobile z-70 flex items-center gap-sm rounded-2xl bg-inverse-surface px-md py-sm font-label-md text-label-md text-inverse-on-surface shadow-card md:bottom-lg md:left-auto md:right-lg md:max-w-[24rem]"
    >
      <Icon name={icon} className="shrink-0 text-sm" />
      {message}
    </div>
  )
}
