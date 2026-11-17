import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { retryLogin, useAuthStatus } from '@/lib/auth-status'
import type { ReactNode } from 'react'

function FullScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-background flex h-svh items-center justify-center px-4">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** Replaces the whole app when the API client reports an auth failure it cannot fix itself. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const status = useAuthStatus(s => s.status)

  if (status.kind === 'forbidden') {
    return (
      <FullScreen title={t('forbidden.title')}>
        {status.email ? <p className="font-medium break-all">{status.email}</p> : null}
        <p className="text-muted-foreground text-sm">{t('forbidden.body')}</p>
      </FullScreen>
    )
  }

  if (status.kind === 'session-failed') {
    return (
      <FullScreen title={t('sessionFailed.title')}>
        <p className="text-muted-foreground text-sm">{t('sessionFailed.body')}</p>
        <Button onClick={retryLogin}>{t('sessionFailed.retry')}</Button>
      </FullScreen>
    )
  }

  return children
}
