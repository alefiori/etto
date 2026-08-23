import { useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useAppShell } from '@/context/AppShellContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import type { TranslationKey } from '@/lib/i18n'
import { AddFoodModal } from '@/components/addfood/AddFoodModal'
import { CustomFoodModal } from '@/components/addfood/CustomFoodModal'
import { PaywallModal } from '@/components/paywall/PaywallModal'
import { GuestBanner } from '@/components/layout/GuestBanner'
import { useReminderSync } from '@/hooks/useReminderSync'
import { useChromeMetrics } from '@/hooks/useChromeMetrics'

interface NavItem {
  to: string
  /** Full label (sidebar). */
  labelKey: TranslationKey
  /** Short label (bottom nav). */
  shortKey: TranslationKey
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', shortKey: 'nav.dashboard', icon: 'dashboard' },
  { to: '/targets', labelKey: 'nav.weeklyTargets', shortKey: 'nav.targetsShort', icon: 'calendar_month' },
  { to: '/foods', labelKey: 'nav.myFoods', shortKey: 'nav.foodsShort', icon: 'restaurant_menu' },
  { to: '/profile', labelKey: 'nav.profile', shortKey: 'nav.profile', icon: 'person' },
]

function Sidebar() {
  const { user, signOut, isAnonymous } = useAuth()
  const navigate = useNavigate()
  const { openAddFood } = useAppShell()
  const { t } = useI18n()

  return (
    // The drawer floats clear of all four edges instead of butting against
    // them, so the aurora and the content both pass behind it — that gap is
    // what makes it read as a pane of glass over the page rather than as a
    // wall beside it. Its width is unchanged at 280px: the inset comes from
    // `left`/`top`/`bottom`, not from the box, so the layout contract the
    // window-size tests assert on still holds.
    <aside className="z-30 hidden h-[calc(100dvh-32px)] w-[280px] shrink-0 flex-col gap-md rounded-[36px] p-lg lg:fixed lg:bottom-4 lg:left-[calc(--spacing(4)+(var(--spacing-safe-left)))] lg:top-4 lg:flex glass-chrome">
      {/* Brand */}
      <div className="mb-xl flex items-center gap-md px-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-white grad-primary">
          <Icon name="track_changes" fill />
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-primary">MacroTrack</h1>
          <p className="font-label-md text-label-md font-normal text-on-surface-variant">
            {t('nav.healthCompanion')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav
        aria-label={t('nav.primary')}
        // `min-h-0` + `overflow-y-auto`: the drawer is a fixed-height column,
        // and at a large text size four destinations plus the account row and
        // the CTA no longer fit in it. Scrolling the destinations is the only
        // outcome here that loses nothing.
        className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              // Settle: a destination lifts a couple of pixels towards the
              // pointer and rebounds under a press, on the one decelerating
              // curve every control in the app answers on.
              `settle flex items-center gap-md rounded-2xl px-md py-3 font-label-md text-label-md hover:translate-x-0.5 active:scale-98 ${
                isActive
                  ? 'bg-primary-tint/[0.14] text-primary'
                  : 'text-on-surface-variant hover:bg-(--glass-chip)'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} fill={isActive} />
                {t(item.labelKey)}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Account + CTA */}
      <div className="mt-auto flex flex-col gap-md">
        <div className="flex items-center justify-between gap-sm rounded-2xl px-md py-sm glass-row">
          <div className="flex min-w-0 items-center gap-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint/[0.14] text-primary">
              <Icon name="person" className="text-[1.25rem]" />
            </div>
            <span
              className="truncate font-body-md text-sm text-on-surface-variant"
              title={isAnonymous ? t('profile.guestAccount') : user?.email ?? ''}
            >
              {isAnonymous ? t('profile.guestAccount') : user?.email}
            </span>
          </div>
          {isAnonymous ? (
            // A guest can't sign out of an account they don't have; offer the
            // sign-in screen instead, which opens over the guest session.
            <button
              onClick={() => navigate('/signin')}
              aria-label={t('auth.signInAction')}
              title={t('auth.signInAction')}
              className="tap-target flex shrink-0 items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover) hover:text-on-surface"
            >
              <Icon name="login" className="text-[1.25rem]" />
            </button>
          ) : (
            <button
              onClick={async () => {
                // Sign-out leaves no session, so the guard hands back a guest.
                await signOut()
                navigate('/', { replace: true })
              }}
              aria-label={t('nav.signOut')}
              title={t('nav.signOut')}
              className="tap-target flex shrink-0 items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <Icon name="logout" className="text-[1.25rem]" />
            </button>
          )}
        </div>

        <button
          onClick={() => openAddFood()}
          className="settle flex w-full items-center justify-center gap-sm rounded-2xl px-4 py-3 font-label-md text-label-md hover:brightness-105 active:scale-98 grad-primary"
        >
          <Icon name="add" />
          {t('nav.addFood')}
        </button>
      </div>
    </aside>
  )
}

/**
 * Navigation rail — the tablet-width layout.
 *
 * Between 768px and the sidebar's 1024px breakpoint the app used to render
 * phone chrome: a bottom bar stretched across an iPad in portrait, with a
 * floating button marooned in the corner. Material 3 calls this the "medium"
 * window class and specifies a rail for it, which is what this is: 80px, icons
 * over short labels, with the primary action at the top rather than floating.
 *
 * It reuses NAV_ITEMS, so adding a destination still means editing one array.
 */
function NavRail() {
  const { openAddFood } = useAppShell()
  const { t } = useI18n()

  return (
    // Same 80px lane as before, floated off every edge and capped into a pill.
    <aside className="fixed left-[calc(--spacing(3)+(var(--spacing-safe-left)))] top-[calc(--spacing(3)+(var(--spacing-safe-top)))] bottom-[calc(--spacing(3)+(var(--spacing-safe-bottom)))] z-30 hidden w-[80px] shrink-0 flex-col items-center gap-1 rounded-[40px] py-3 md:flex lg:hidden glass-chrome">
      <NavLink to="/" aria-label="MacroTrack" className="mb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-tint/[0.14] text-primary">
          <Icon name="track_changes" fill className="text-[1.25rem]" />
        </div>
      </NavLink>

      {/* M3 puts the primary action at the top of the rail, not floating. */}
      <button
        onClick={() => openAddFood()}
        aria-label={t('nav.addFood')}
        className="settle mb-1 flex min-h-14 min-w-14 items-center justify-center rounded-[20px] p-2 hover:scale-105 active:scale-95 grad-primary"
      >
        <Icon name="add" className="text-2xl" />
      </button>

      <nav
        aria-label={t('nav.primary')}
        // See the drawer: the rail is fixed-height too, and its icons grow.
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `settle flex w-[68px] flex-col items-center justify-center rounded-[20px] py-2 hover:translate-x-0.5 hover:scale-[1.04] active:scale-95 ${
                isActive
                  ? 'bg-primary-tint/16 text-primary'
                  : 'text-on-surface-variant hover:bg-(--glass-chip)'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} fill={isActive} />
                {/* tracking-normal, against font-label-md's 0.05em: at 10px
                    that letter-spacing is what pushed the longest label past
                    the rail's edge, and it buys nothing at this size. */}
                <span className="chrome-label mt-0.5 w-full truncate px-0.5 text-center font-label-md leading-tight tracking-normal">
                  {t(item.shortKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

/**
 * Phone chrome.
 *
 * The top bar is the one piece of chrome that is *not* a lens. A pill up there
 * would cut a hard edge across a list that is scrolling past it; what the
 * design does instead is fade the blur out — the bar is opaque enough to carry
 * the wordmark at the very top and dissolves to nothing by its lower edge, so
 * content passes under it without ever crossing a line.
 *
 * That fade has to be masked onto a layer of its own: `mask-image` on the bar
 * itself would take the wordmark and the profile button with it.
 */
function TopAppBar({ barRef }: { barRef: React.Ref<HTMLElement> }) {
  const { t } = useI18n()
  return (
    <header ref={barRef} className="fixed top-0 z-40 w-full md:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-[18px] backdrop-saturate-[1.7] mask-[linear-gradient(180deg,#000_58%,transparent)] [-webkit-mask-image:linear-gradient(180deg,#000_58%,transparent)]"
        style={{
          background:
            'linear-gradient(180deg, rgb(var(--surface) / 0.86), rgb(var(--surface) / 0))',
        }}
      />
      <div className="relative flex items-center justify-between px-container-margin-mobile py-md pt-[calc(var(--spacing-md)+(var(--spacing-safe-top)))]">
        <h1 className="font-headline-md text-headline-md font-bold text-primary">MacroTrack</h1>
        <NavLink
          to="/profile"
          aria-label={t('nav.profile')}
          className="tap-target settle flex items-center justify-center rounded-full p-2 text-on-surface-variant hover:bg-(--glass-chip) active:scale-95"
        >
          <Icon name="account_circle" />
        </NavLink>
      </div>
    </header>
  )
}

/**
 * The tab bar, as a floating pill rather than a bar welded to the bottom edge.
 * `justify-around` gave every destination a different-width hit area depending
 * on how long its label translated to; the pill divides itself evenly instead,
 * which matters more now that it no longer spans the full width.
 *
 * The primary action rides *inside* the pill, at its right-hand end. It used to
 * be a free-floating button above the bar, which is what a bar welded to the
 * bottom edge needs — there is nowhere else for it to go. Once the bar became a
 * pill floating in the same layer, two floating objects a few pixels apart read
 * as chrome that failed to line up rather than as one control cluster, and the
 * button covered the top-right corner of whatever card sat under it. Inside, it
 * is the same lens as the rail's, which puts the action in the same place at
 * every window class: at the near end of the navigation, not beside it.
 */
function BottomNav({ barRef }: { barRef: React.Ref<HTMLElement> }) {
  const { openAddFood } = useAppShell()
  const { t } = useI18n()
  return (
    <nav
      ref={barRef}
      aria-label={t('nav.primary')}
      className="fixed bottom-chrome-inset left-4 right-4 z-50 flex items-center gap-1 rounded-chrome px-2 py-2 md:hidden glass-chrome"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            // No hover lift here: this bar only exists at phone width, where a
            // hover state is a state a finger can't leave.
            // `min-w-0` so the labels may truncate rather than force the row
            // wider than the pill: at 320px (iPad Slide Over) the four tabs
            // share ~214px once the action has taken its 52px, and the longest
            // short label in German does not fit that unaided.
            `settle flex min-w-0 flex-1 flex-col items-center justify-center rounded-[22px] py-1.5 active:scale-90 ${
              isActive
                ? 'bg-primary-tint/16 text-primary'
                : 'text-on-surface-variant hover:bg-(--glass-chip)'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} fill={isActive} />
              <span className="chrome-label mt-0.5 w-full truncate px-0.5 text-center font-label-md tracking-normal">
                {t(item.shortKey)}
              </span>
            </>
          )}
        </NavLink>
      ))}

      {/* `shrink-0` against the four `flex-1` tabs: the destinations divide
          what is left, and the action keeps its 52px however long the labels
          translate to. */}
      <button
        onClick={() => openAddFood()}
        aria-label={t('nav.addFood')}
        // The store-screenshot run drives this control in all 7 languages,
        // where the accessible name is a different string every time and three
        // controls share it (drawer, rail, tab bar) with one visible per window
        // class. A stable hook is cheaper than the guesswork.
        data-testid="add-food-fab"
        className="settle ml-1.5 flex min-h-[52px] min-w-[52px] shrink-0 items-center justify-center rounded-[19px] p-1.5 active:scale-95 grad-primary"
      >
        <Icon name="add" className="text-2xl" />
      </button>
    </nav>
  )
}

export default function AppLayout() {
  const {
    _addFood,
    _closeAddFood,
    _customFood,
    _closeCustomFood,
    bumpFoodsVersion,
    _paywallOpen,
    _closePaywall,
  } = useAppShell()
  const { t } = useI18n()

  // The two pieces of phone chrome the content lane has to clear. Their height
  // is no longer a constant — it follows the reader's text size — so it is
  // measured and published rather than assumed. See useChromeMetrics.
  const topBarRef = useRef<HTMLElement>(null)
  const bottomNavRef = useRef<HTMLElement>(null)
  useChromeMetrics(topBarRef, bottomNavRef)

  // Keeps the queued hydration reminders honest — see useReminderSync. It lives
  // in the shell rather than on the Profile page because the queue has to be
  // re-armed when the app is resumed or a drink is logged, neither of which
  // happens anywhere near the settings that describe it. A no-op on the web.
  useReminderSync()

  return (
    // No page colour of its own: the aurora is painted on <body> and the shell
    // has to let it through, or the lenses would be refracting a flat slab.
    <div className="flex h-dvh overflow-hidden text-on-surface antialiased">
      {/* First thing in the tab order, and invisible until it has focus.
          Without it a keyboard or switch user pays for the navigation on every
          page: four destinations, the account row and the add button stand
          between the top of the document and the first thing on the page they
          actually came to read. `sr-only` alone would leave it unreachable-
          looking when focused, so the focus state takes it out of that class
          and puts it on screen as a real chip. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:font-label-md focus:text-label-md focus:text-on-primary"
      >
        {t('nav.skipToContent')}
      </a>

      <Sidebar />
      <NavRail />
      <TopAppBar barRef={topBarRef} />

      {/* The rail and drawer float, so the content lane clears their inset as
          well as their width — 12+80 and 16+280 plus a gap in each case. */}
      {/* `tabIndex={-1}` so the skip link above can actually move focus here:
          a bare `#main` jump scrolls the region into view but leaves focus on
          the link, and the next Tab goes straight back into the navigation the
          user just skipped. */}
      <main
        id="main"
        tabIndex={-1}
        className="w-full flex-1 overflow-y-auto pb-bottomnav pt-topbar outline-hidden md:ml-[104px] md:pb-lg md:pt-lg lg:ml-[312px]"
      >
        <GuestBanner />
        <Outlet />
      </main>

      {/* Carries the primary action itself — see the note on BottomNav. */}
      <BottomNav barRef={bottomNavRef} />

      <AddFoodModal open={_addFood.open} initialMeal={_addFood.meal} onClose={_closeAddFood} />

      {/* Mounted only while open, so each visit starts from an empty draft —
          see the note in CustomFoodModal. It sits above the Add Food overlay
          (z-60) because that is one of the two places it is opened from. */}
      {_customFood.open && (
        <CustomFoodModal
          foodId={_customFood.id}
          prefill={_customFood.prefill}
          onClose={_closeCustomFood}
          onSaved={bumpFoodsVersion}
        />
      )}

      <PaywallModal open={_paywallOpen} onClose={_closePaywall} />
    </div>
  )
}
