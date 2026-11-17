import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { browser, useAuthStatus } from '@/lib/auth-status'

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

  it('leaves auth status alone on other errors', async () => {
    useAuthStatus.setState({ status: { kind: 'ok' } })
    fetchMock.mockImplementation(async () => respond(404, { message: 'Not found' }))
    await expect(api.get('/x')).rejects.toThrow('Not found')
    expect(useAuthStatus.getState().status).toEqual({ kind: 'ok' })
  })

  it('keeps Content-Type for JSON and leaves it to the browser for FormData', async () => {
    await api.post('/x', { a: 1 })
    await api.post('/x', new FormData())
    const [[, json], [, form]] = fetchMock.mock.calls as [string, RequestInit][]
    expect(new Headers(json.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(form.headers).get('Content-Type')).toBeNull()
  })
})
