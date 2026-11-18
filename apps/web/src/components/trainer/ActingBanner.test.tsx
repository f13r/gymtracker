import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActingBanner } from './ActingBanner'
import i18n from '@/lib/i18n'
import { queryClient } from '@/lib/query'
import { useActingStore } from '@/stores/acting.store'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function renderBanner() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ActingBanner />
    </QueryClientProvider>,
  )
}

describe('ActingBanner', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  beforeEach(() => {
    sessionStorage.clear()
    useActingStore.setState({ athlete: null })
    navigate.mockReset()
  })

  it('banner hidden when not acting', () => {
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('banner names the athlete and Exit stops acting', () => {
    useActingStore.setState({ athlete: { id: 'inna', displayName: 'Inna' } })
    renderBanner()
    expect(screen.getByText('Viewing Inna')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(useActingStore.getState().athlete).toBeNull()
    expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' })
  })
})
