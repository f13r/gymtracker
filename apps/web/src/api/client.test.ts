import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from './client'
import { browser, useAuthStatus } from '@/lib/auth-status'
import { queryClient } from '@/lib/query'
import { useToast } from '@/lib/toast'
import { useActingStore } from '@/stores/acting.store'

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => respond(200, {}))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['get', () => api.get('/x')],
    ['post', () => api.post('/x', { a: 1 })],
    ['patch', () => api.patch('/x', { a: 1 })],
    ['delete', () => api.delete('/x')],
    ['post FormData', () => api.post('/x', new FormData())],
  ])('%s sends X-Requested-With and same-origin credentials', async (_name, call) => {
    await call()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(init.credentials).toBe('same-origin')
  })

  describe('401 (Cloudflare Access session missing or expired)', () => {
    let reload: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      sessionStorage.clear()
      useAuthStatus.setState({ status: { kind: 'ok' } })
      reload = vi.spyOn(browser, 'reload').mockImplementation(() => {})
      fetchMock.mockImplementation(async () => respond(401, { message: 'Unauthorized' }))
    })

    afterEach(() => {
      reload.mockRestore()
      vi.useRealTimers()
    })

    it('reloads the page once into the login', async () => {
      await expect(api.get('/x')).rejects.toThrow()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
    })

    it('shows the session error instead of reloading again on a second 401 right after', async () => {
      await expect(api.get('/x')).rejects.toThrow()
      await expect(api.delete('/x')).rejects.toThrow()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(useAuthStatus.getState().status).toEqual({ kind: 'session-failed' })
    })

    it('reloads again when the previous reload was long ago', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))
      await expect(api.get('/x')).rejects.toThrow()
      vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
      await expect(api.get('/x')).rejects.toThrow()
      expect(reload).toHaveBeenCalledTimes(2)
      expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
    })
  })

  describe('403 (signed in, but not an allowed User)', () => {
    beforeEach(() => {
      useAuthStatus.setState({ status: { kind: 'ok' } })
    })

    it('reports forbidden with the email from the response body', async () => {
      fetchMock.mockImplementation(async () => respond(403, { message: 'Forbidden', email: 'stranger@example.com' }))
      await expect(api.get('/x')).rejects.toThrow()
      expect(useAuthStatus.getState().status).toEqual({ kind: 'forbidden', email: 'stranger@example.com' })
    })

    it('still reports forbidden when the body has no email', async () => {
      fetchMock.mockImplementation(async () => new Response('nope', { status: 403 }))
      await expect(api.delete('/x')).rejects.toThrow()
      expect(useAuthStatus.getState().status).toEqual({ kind: 'forbidden', email: null })
    })
  })

  describe('acting as an athlete', () => {
    const inna = { id: 'inna', displayName: 'Inna' }

    beforeEach(() => {
      sessionStorage.clear()
      useActingStore.setState({ athlete: null })
      useAuthStatus.setState({ status: { kind: 'ok' } })
      useToast.setState({ message: null })
    })

    afterEach(() => {
      useActingStore.setState({ athlete: null })
    })

    it('adds X-Act-As while acting', async () => {
      useActingStore.setState({ athlete: inna })
      await api.get('/x')
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(new Headers(init.headers).get('X-Act-As')).toBe('inna')
    })

    it('no X-Act-As when not acting', async () => {
      await api.get('/x')
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(new Headers(init.headers).has('X-Act-As')).toBe(false)
    })

    it('a trainer-access 403 toasts and leaves auth status ok', async () => {
      useActingStore.setState({ athlete: inna })
      fetchMock.mockImplementation(async () =>
        respond(403, { statusCode: 403, message: 'Not authorised', reason: 'trainer-access' }),
      )
      await expect(api.post('/x', {})).rejects.toThrow()
      expect(useToast.getState().message).toContain('Inna')
      expect(useActingStore.getState().athlete).toEqual(inna)
      expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
    })

    it('a not-your-athlete 403 stops acting and clears the cache', async () => {
      useActingStore.setState({ athlete: inna })
      queryClient.setQueryData(['profile'], { trainingDays: ['monday'] })
      fetchMock.mockImplementation(async () =>
        respond(403, { statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' }),
      )
      await expect(api.get('/x')).rejects.toThrow()
      expect(useActingStore.getState().athlete).toBeNull()
      expect(queryClient.getQueryData(['profile'])).toBeUndefined()
      expect(useToast.getState().message).toContain('Inna')
      expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
    })

    it('a not-your-athlete 403 for a stale request leaves the current acting alone', async () => {
      useActingStore.setState({ athlete: inna })
      fetchMock.mockImplementation(async () => {
        // The Trainer switched to another athlete while this request was in flight.
        useActingStore.setState({ athlete: { id: 'other', displayName: 'Other' } })
        return respond(403, { statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
      })
      await expect(api.get('/x')).rejects.toThrow()
      expect(useActingStore.getState().athlete).toEqual({ id: 'other', displayName: 'Other' })
      expect(useToast.getState().message).toBeNull()
    })

    it('an unknown 403 reason while acting still reports forbidden', async () => {
      useActingStore.setState({ athlete: inna })
      fetchMock.mockImplementation(async () => respond(403, { message: 'Forbidden', reason: 'something-else' }))
      await expect(api.get('/x')).rejects.toThrow()
      expect(useAuthStatus.getState().status).toEqual({ kind: 'forbidden', email: null })
      expect(useActingStore.getState().athlete).toEqual(inna)
    })
  })

  it('leaves auth status alone on other errors', async () => {
    useAuthStatus.setState({ status: { kind: 'ok' } })
    fetchMock.mockImplementation(async () => respond(404, { message: 'Not found' }))
    await expect(api.get('/x')).rejects.toThrow('Not found')
    expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
  })

  it('rejects with an ApiError carrying the status and parsed body', async () => {
    const body = { statusCode: 409, error: 'Conflict', message: 'Exercise exists', exerciseId: 'ex-1' }
    fetchMock.mockImplementation(async () => respond(409, body))
    const error = await api.post('/x', { a: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ status: 409, message: 'Exercise exists', body })
  })

  it('still rejects with an ApiError when the error body is not JSON', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500, statusText: 'Server Error' }))
    const error = await api.get('/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 500, message: 'Server Error' })
  })

  it('returns the DELETE response body when there is one', async () => {
    fetchMock.mockImplementation(async () => respond(200, { archived: true }))
    await expect(api.delete<{ archived: boolean }>('/x')).resolves.toEqual({ archived: true })
  })

  it('resolves an empty DELETE response to undefined', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await expect(api.delete('/x')).resolves.toBeUndefined()
  })

  it('keeps Content-Type for JSON and leaves it to the browser for FormData', async () => {
    await api.post('/x', { a: 1 })
    await api.post('/x', new FormData())
    const [[, json], [, form]] = fetchMock.mock.calls as [string, RequestInit][]
    expect(new Headers(json.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(form.headers).get('Content-Type')).toBeNull()
  })
})
