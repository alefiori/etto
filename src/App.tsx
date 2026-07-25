import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { AppShellProvider } from '@/context/AppShellContext'
import { ProfileProvider } from '@/context/ProfileContext'
import { I18nProvider, useI18n } from '@/context/I18nContext'
import { MealsProvider } from '@/context/MealsContext'
import { RequireAuth } from '@/components/RequireAuth'
import { LoadingBlock } from '@/components/ui/Spinner'
import AppLayout from '@/components/layout/AppLayout'

// Route-level code splitting: each page ships in its own chunk so the initial
// load only pulls in the route the user actually lands on.
const AuthPage = lazy(() => import('@/pages/AuthPage'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Targets = lazy(() => import('@/pages/Targets'))
const MyFoods = lazy(() => import('@/pages/MyFoods'))
const CreateCustomFood = lazy(() => import('@/pages/CreateCustomFood'))
const Profile = lazy(() => import('@/pages/Profile'))

function RouteFallback() {
  const { t } = useI18n()
  return <LoadingBlock label={t('common.loading')} />
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Profile + i18n wrap everything, so the auth pages are localized too. */}
      <AuthProvider>
        <ProfileProvider>
          <I18nProvider>
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
                  <Route path="/foods/new" element={<CreateCustomFood />} />
                  <Route path="/foods/:id/edit" element={<CreateCustomFood />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </I18nProvider>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
