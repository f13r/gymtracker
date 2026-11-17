import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { syncIdentity } from './identity'

const LAST_USER_KEY = 'gymtracker-last-user-id'

function meResponse(id: string) {
  return new Response(JSON.stringify({ id, displayName: id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('syncIdentity', () => {
  let queryClient: QueryClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], { trainingDays: ['monday'] })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the API who is signed in', async () => {
    fetchMock.mockResolvedValue(meResponse('default-user'))
    await syncIdentity(queryClient)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
  })

  it('keeps the cache when the same User is still signed in', async () => {
    localStorage.setItem(LAST_USER_KEY, 'default-user')
    fetchMock.mockResolvedValue(meResponse('default-user'))
    await syncIdentity(queryClient)
    expect(queryClient.getQueryData(['profile'])).toEqual({ trainingDays: ['monday'] })
  })

  it('drops the previous User’s cached data when a different User signs in', async () => {
    localStorage.setItem(LAST_USER_KEY, 'default-user')
    fetchMock.mockResolvedValue(meResponse('inna'))
    await syncIdentity(queryClient)
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
    expect(localStorage.getItem(LAST_USER_KEY)).toBe('inna')
  })

  it('treats a first-ever sign-in as a change and remembers the User', async () => {
    fetchMock.mockResolvedValue(meResponse('default-user'))
    await syncIdentity(queryClient)
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
    expect(localStorage.getItem(LAST_USER_KEY)).toBe('default-user')
  })

  it('fails open on a network error: no throw, cache kept', async () => {
    localStorage.setItem(LAST_USER_KEY, 'default-user')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(syncIdentity(queryClient)).resolves.toBeUndefined()
    expect(queryClient.getQueryData(['profile'])).toEqual({ trainingDays: ['monday'] })
  })
})
