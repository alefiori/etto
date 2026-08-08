import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useAppShell } from '@/context/AppShellContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import type { TranslationKey } from '@/lib/i18n'
import { AddFoodModal } from '@/components/addfood/AddFoodModal'
import { PaywallModal } from '@/components/paywall/PaywallModal'
import { GuestBanner } from '@/components/layout/GuestBanner'

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
    <aside className="z-30 hidden h-[100dvh] w-[280px] shrink-0 flex-col gap-md border-r border-surface-container-high bg-surface-container-low p-lg shadow-sidebar lg:fixed lg:left-0 lg:top-0 lg:flex">
      {/* Brand */}
      <div className="mb-xl flex items-center gap-md px-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
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
      <nav className="flex flex-1 flex-col gap-sm">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-md rounded-2xl px-md py-3 font-label-md text-label-md transition-transform active:scale-98 ${
                isActive
                  ? 'bg-primary-tint/10 text-primary'
                  : 'text-on-surface-variant hover:bg-secondary-container'
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
        <div className="flex items-center justify-between gap-sm rounded-2xl bg-surface-container-lowest px-md py-sm">
          <div className="flex min-w-0 items-center gap-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="person" className="text-[20px]" />
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
              className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
            >
              <Icon name="login" className="text-[20px]" />
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
              className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <Icon name="logout" className="text-[20px]" />
            </button>
          )}
        </div>

        <button
          onClick={() => openAddFood()}
          className="flex w-full items-center justify-center gap-sm rounded-2xl bg-primary px-4 py-3 font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-hover hover:shadow-md"
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
    <aside className="fixed left-0 top-0 z-30 hidden h-[100dvh] w-[80px] shrink-0 flex-col items-center gap-sm border-r border-surface-container-high bg-surface-container-low pl-safe-left pt-[calc(theme(spacing.md)+theme(spacing.safe-top))] pb-[calc(theme(spacing.md)+theme(spacing.safe-bottom))] md:flex lg:hidden">
      <NavLink to="/" aria-label="MacroTrack" className="mb-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
          <Icon name="track_changes" fill />
        </div>
      </NavLink>

      {/* M3 puts the primary action at the top of the rail, not floating. */}
      <button
        onClick={() => openAddFood()}
        aria-label={t('nav.addFood')}
        className="mb-md flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-sm transition-transform active:scale-95"
      >
        <Icon name="add" className="text-2xl" />
      </button>

      <nav className="flex flex-1 flex-col items-center gap-sm">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex w-[64px] flex-col items-center justify-center rounded-2xl py-2 transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} fill={isActive} />
                <span className="mt-0.5 text-center font-label-md text-[10px] leading-tight">
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
 * Phone chrome. Both bars are painted `surface` in light and lifted one step to
 * `surface-container-low` in dark: on a dark page, chrome painted in the page's
 * own color is indistinguishable from the content scrolling under it, which is
 * the same reason the sidebar sits a step above the page in both schemes.
 */
function TopAppBar() {
  const { t } = useI18n()
  return (
    <nav className="fixed top-0 z-40 flex w-full items-center justify-between bg-surface px-container-margin-mobile py-md pt-[calc(theme(spacing.md)+theme(spacing.safe-top))] shadow-sm dark:bg-surface-container-low md:hidden">
      <h1 className="font-headline-md text-headline-md font-bold text-primary">MacroTrack</h1>
      <NavLink
        to="/profile"
        aria-label={t('nav.profile')}
        className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
      >
        <Icon name="account_circle" />
      </NavLink>
    </nav>
  )
}

function BottomNav() {
  const { t } = useI18n()
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-surface-container-high bg-surface px-4 py-2 pb-[calc(theme(spacing.2)+theme(spacing.safe-bottom))] shadow-bottomnav dark:bg-surface-container-low md:hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center rounded-full px-4 py-1 transition-all duration-200 active:scale-90 ${
              isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} fill={isActive} />
              <span className="mt-0.5 font-label-md text-[10px]">
                {t(item.shortKey)}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppLayout() {
  const { openAddFood, _addFood, _closeAddFood, _paywallOpen, _closePaywall } = useAppShell()
  const { t } = useI18n()

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-on-surface antialiased">
      <Sidebar />
      <NavRail />
      <TopAppBar />

      <main className="w-full flex-1 overflow-y-auto pb-bottomnav pt-topbar md:ml-[80px] md:pb-0 md:pt-0 lg:ml-[280px]">
        <GuestBanner />
        <Outlet />
      </main>

      <BottomNav />

      {/* Floating action button (mobile) */}
      <button
        onClick={() => openAddFood()}
        aria-label={t('nav.addFood')}
        className="fixed bottom-fab right-container-margin-mobile z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <Icon name="add" className="text-2xl" />
      </button>

      <AddFoodModal open={_addFood.open} initialMeal={_addFood.meal} onClose={_closeAddFood} />

      <PaywallModal open={_paywallOpen} onClose={_closePaywall} />
    </div>
  )
}
