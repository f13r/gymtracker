import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Me } from '@gymtracker/shared'

import { SettingsPage } from './settings'
import i18n from '@/lib/i18n'
import { useActingStore } from '@/stores/acting.store'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

let me: Me
vi.mock('@/api/me', () => ({ meApi: { get: () => Promise.resolve(me) } }))
vi.mock('@/api/profile', () => ({
  profileApi: { get: () => Promise.resolve({ trainingDays: [], sessionDurationMinutes: 60 }), update: vi.fn() },
}))

const self = { id: 'default-user', displayName: 'Coach' }
const inna = { id: 'inna', displayName: 'Inna' }

function renderSettings() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

describe('SettingsPage trainer sections', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  beforeEach(() => {
    sessionStorage.clear()
    useActingStore.setState({ athlete: null })
    navigate.mockReset()
  })

  it('Settings shows athletes only for a Trainer', async () => {
    me = { ...self, athletes: [inna], trainers: [] }
    renderSettings()
    const button = await screen.findByRole('button', { name: 'Inna' })
    expect(screen.queryByText('Your Trainer')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(useActingStore.getState().athlete).toEqual(inna)
    expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' })
  })

  it('Settings hides the athlete list while acting', async () => {
    me = { ...self, athletes: [inna], trainers: [] }
    useActingStore.setState({ athlete: inna })
    renderSettings()
    await screen.findByText('Weight Units')
    expect(screen.queryByRole('button', { name: 'Inna' })).not.toBeInTheDocument()
  })

  it('Settings shows "Your Trainer" for an athlete', async () => {
    me = { ...inna, athletes: [], trainers: [{ id: 'default-user', displayName: 'Coach' }] }
    renderSettings()
    expect(await screen.findByText('Your Trainer')).toBeInTheDocument()
    expect(screen.getByText('Coach')).toBeInTheDocument()
    expect(screen.queryByText('Act as…')).not.toBeInTheDocument()
  })
})
