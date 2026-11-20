import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@gymtracker/shared'

import i18n from '@/lib/i18n'
import { BodyPage } from '@/routes/body'
import { useActingStore } from '@/stores/acting.store'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/api/body', () => ({ bodyApi: { getWeights: () => Promise.resolve([]), addWeight: vi.fn() } }))
vi.mock('@/api/profile', () => ({ profileApi: { get: () => Promise.resolve(null), update: vi.fn() } }))

const athlete = { id: 'inna', name: 'Inna' } as unknown as AuthUser

function renderBody() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BodyPage />
    </QueryClientProvider>,
  )
}

describe('BodyPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => useActingStore.setState({ athlete: null }))

  it('shows everything when acting as yourself', async () => {
    renderBody()
    expect(await screen.findByLabelText(/^age$/i)).toBeTruthy()
    expect(screen.getByLabelText(/weight in kg/i)).toBeTruthy()
    expect(screen.getByText(/progress photos/i)).toBeTruthy()
  })

  it("lets a Trainer edit the athlete's profile but not add weight or open Photos", async () => {
    useActingStore.setState({ athlete })
    renderBody()
    expect(await screen.findByLabelText(/^age$/i)).toBeTruthy()
    expect(screen.queryByLabelText(/weight in kg/i)).toBeNull()
    expect(screen.queryByText(/progress photos/i)).toBeNull()
  })
})
