import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { LoadingBlock } from '@/components/ui/Spinner'

/** Gates app routes behind authentication; redirects to /signin otherwise. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label={t('auth.loadingAccount')} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location }} />
  }

  return <>{children}</>
}
