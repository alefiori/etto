import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { AppShellProvider } from '@/context/AppShellContext'
import { ProfileProvider } from '@/context/ProfileContext'
import { EntitlementProvider } from '@/context/EntitlementContext'
import { isNativePlatform } from '@/lib/platform'
import { I18nProvider, useI18n } from '@/context/I18nContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { MealsProvider } from '@/context/MealsContext'
import { RequireAuth } from '@/components/RequireAuth'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoadingBlock } from '@/components/ui/Spinner'
import AppLayout from '@/components/layout/AppLayout'

// Route-level code splitting: each page ships in its own chunk so the initial
// load only pulls in the route the user actually lands on.
const AuthPage = lazy(() => import('@/pages/AuthPage'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Targets = lazy(() => import('@/pages/Targets'))
const MyFoods = lazy(() => import('@/pages/MyFoods'))
const Profile = lazy(() => import('@/pages/Profile'))

function RouteFallback() {
  const { t } = useI18n()
  return <LoadingBlock label={t('common.loading')} />
}

/**
 * The route-level boundary, reset on navigation.
 *
 * `ErrorBoundary` only clears a caught error when it remounts — its own
 * component instance otherwise lives for as long as its parent does, which
 * here is the lifetime of the whole app. Without a reset, a crash on one page
 * would leave every *other* page showing the same crash screen too, since
 * `<Routes>` never gets the chance to render again underneath a boundary
 * that's already decided to show its fallback instead of `children`.
 * `pathname` as the `key` gives React a reason to tear the boundary down and
 * build a fresh one on every navigation, so leaving the page that crashed is
 * itself a recovery — not just the Reload button in the fallback, which stays
 * the only way out of a stale-chunk failure specifically (see
 * ErrorBoundary.tsx: React caches the rejected lazy() promise, and only a
 * reload refetches it).
 */
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname} label="route">
      {children}
    </ErrorBoundary>
  )
}

/**
 * Path routing on the web, hash routing in the native shell.
 *
 * A Capacitor WebView has no server to fall back to index.html, and the service
 * worker that provided navigateFallback never registers under the custom
 * scheme — so a reload or a restored deep path on BrowserRouter lands on a
 * white screen. Hash routing needs no such fallback. The web build keeps clean
 * paths.
 */
const Router = isNativePlatform() ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      {/* Profile, theme and i18n wrap everything, so the auth pages are
          localized and correctly themed too. Entitlement sits beside them
          rather than inside RequireAuth, so the paywall and restore-purchases
          flow work before the guarded routes. */}
      <AuthProvider>
        <ProfileProvider>
          <ThemeProvider>
            <EntitlementProvider>
              <I18nProvider>
                {/* Below the root boundary in main.tsx, which has to assume
                    nothing works yet. This one can use useI18n() — the
                    provider above it has already mounted. It is the outer
                    safety net: AuthPage and ForgotPassword have no chrome of
                    their own to protect, so a failure there is caught here
                    directly. The four guarded pages behind RequireAuth have
                    their own, *inner* boundary around AppLayout's <Outlet />
                    instead — see its comment — so that a chunk 404ing there
                    (a deploy rotating the hashed filenames, say) or an
                    ordinary render crash takes down only that page's content,
                    not the sidebar and tab bar around it. This one is what is
                    left to catch AppLayout — or RequireAuth, or the providers
                    between them — failing before any of that chrome exists to
                    protect. See RoutedErrorBoundary for why it is keyed on
                    the path. */}
                <RoutedErrorBoundary>
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                      {/* Public auth routes */}
                      <Route path="/signin" element={<AuthPage initialTab="signin" />} />
                      <Route path="/signup" element={<AuthPage initialTab="signup" />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />

                      {/* Guarded app routes */}
                      <Route
                        element={
                          <RequireAuth>
                            <MealsProvider>
                              <AppShellProvider>
                                <AppLayout />
                              </AppShellProvider>
                            </MealsProvider>
                          </RequireAuth>
                        }
                      >
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/targets" element={<Targets />} />
                        <Route path="/foods" element={<MyFoods />} />
                        <Route path="/profile" element={<Profile />} />
                      </Route>

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </RoutedErrorBoundary>
              </I18nProvider>
            </EntitlementProvider>
          </ThemeProvider>
        </ProfileProvider>
      </AuthProvider>
    </Router>
  )
}
