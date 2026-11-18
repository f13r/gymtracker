import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthGate } from './components/auth/AuthGate'
import { Toaster } from './components/ui/toaster'
import i18n from './lib/i18n'
import { consumeLinkGoneNotice } from './lib/link-gone'
import { queryClient } from './lib/query'
import { showToast } from './lib/toast'
import { router } from './router'

import './index.css'

if (import.meta.env.DEV) {
  void import('react-grab')
}

const lostAthlete = consumeLinkGoneNotice()
if (lostAthlete) {
  showToast(i18n.t('trainer:linkGone', { name: lostAthlete }))
}

queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <RouterProvider router={router} />
        <Toaster />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
)
