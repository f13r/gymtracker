import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AuthGate } from './AuthGate'
import { useAuthStatus } from '@/lib/auth-status'
import i18n from '@/lib/i18n'
import enAuth from '@/locales/en/auth.json'
import ukAuth from '@/locales/uk/auth.json'

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' && !Array.isArray(v) ? collectKeys(v as Record<string, unknown>, path) : [path]
  })
}

describe('AuthGate', () => {
  beforeEach(async () => {
    useAuthStatus.setState({ status: { kind: 'ok' } })
    await i18n.changeLanguage('en')
  })

  afterEach(async () => {
    await i18n.changeLanguage('uk')
  })

  it('renders the app when auth is fine', () => {
    render(<AuthGate>app content</AuthGate>)
    expect(screen.getByText('app content')).toBeInTheDocument()
  })

  it('replaces the app with a not-authorised screen naming the email on 403', () => {
    render(<AuthGate>app content</AuthGate>)
    act(() => useAuthStatus.setState({ status: { kind: 'forbidden', email: 'stranger@example.com' } }))
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /not authorised/i })).toBeInTheDocument()
    expect(screen.getByText('stranger@example.com')).toBeInTheDocument()
  })

  it('shows the not-authorised screen in Ukrainian by default', async () => {
    await i18n.changeLanguage('uk')
    useAuthStatus.setState({ status: { kind: 'forbidden', email: 'stranger@example.com' } })
    render(<AuthGate>app content</AuthGate>)
    expect(screen.getByRole('heading', { name: ukAuth.forbidden.title })).toBeInTheDocument()
  })

  it('shows a session error with a retry when login keeps failing', () => {
    useAuthStatus.setState({ status: { kind: 'session-failed' } })
    render(<AuthGate>app content</AuthGate>)
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: enAuth.sessionFailed.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: enAuth.sessionFailed.retry })).toBeInTheDocument()
  })

  it('uk and en auth.json have identical key sets', () => {
    expect(collectKeys(ukAuth).sort()).toEqual(collectKeys(enAuth).sort())
  })
})
