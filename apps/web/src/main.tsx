import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './lib/i18n'
import { queryClient } from './lib/query'
import { router } from './router'

import './index.css'

if (import.meta.env.DEV) {
  void import('react-grab')
}

queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
