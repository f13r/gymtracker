import { browser, handleForbidden, handleUnauthorized } from '@/lib/auth-status'
import i18n from '@/lib/i18n'
import { rememberLinkGone } from '@/lib/link-gone'
import { queryClient } from '@/lib/query'
import { showToast } from '@/lib/toast'
import { stopActing, useActingStore } from '@/stores/acting.store'

const BASE = '/api'

/** A non-2xx API response: `status` plus the parsed JSON body (e.g. a 409's `exerciseId`). */
export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// Every API call goes through here. X-Requested-With makes Cloudflare Access
// answer an expired session with 401 instead of a cross-origin login redirect
// (which fetch can only report as an opaque CORS error).
async function send(path: string, options: RequestInit = {}, actAs = true): Promise<Response> {
  // Only a JSON string body is labelled JSON. FormData gets its multipart type
  // (with boundary) from the browser, and a bodyless request (GET, DELETE) gets
  // none: Fastify answers 400 to an empty body that claims to be JSON.
  const isJson = typeof options.body === 'string'
  const acting = actAs ? useActingStore.getState().athlete : null
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      'X-Requested-With': 'XMLHttpRequest',
      ...(acting ? { 'X-Act-As': acting.id } : {}),
    },
  })
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => ({ message: res.statusText }))
    const error = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
    if (res.status === 401) {
      handleUnauthorized()
    } else if (res.status === 403) {
      if (acting && error.reason === 'trainer-access') {
        showToast(i18n.t('trainer:notWhileActing', { name: acting.displayName }))
      } else if (acting && error.reason === 'not-your-athlete') {
        // Only end acting if it is still the athlete this request was sent for;
        // a late answer must not undo a newer switch.
        if (useActingStore.getState().athlete?.id === acting.id) {
          stopActing(queryClient)
          // Mounted pages that do not read the acting store would keep showing the
          // athlete's data, so reload into the Trainer's own dashboard. The notice
          // is shown on the next boot (see main.tsx).
          rememberLinkGone(acting.displayName)
          browser.replace('/dashboard')
        }
      } else {
        handleForbidden(typeof error.email === 'string' ? error.email : null)
      }
    }
    const message = typeof error.message === 'string' && error.message ? error.message : 'Request failed'
    throw new ApiError(res.status, error, message)
  }
  return res
}

async function request<T>(path: string, options?: RequestInit, actAs?: boolean): Promise<T> {
  const res = await send(path, options, actAs)
  return res.json() as Promise<T>
}

const body = (value: unknown) => (value instanceof FormData ? value : JSON.stringify(value))

export const api = {
  // `actAs: false` sends the request as the signed-in User even while acting (only /me needs it).
  get: <T>(path: string, opts?: { actAs?: boolean }) => request<T>(path, undefined, opts?.actAs),
  post: <T>(path: string, value: unknown) => request<T>(path, { method: 'POST', body: body(value) }),
  patch: <T>(path: string, value: unknown) => request<T>(path, { method: 'PATCH', body: body(value) }),
  // Most DELETEs answer with an empty body; some (e.g. /exercises/:id) report what happened.
  delete: async <T = void>(path: string): Promise<T> => {
    const text = await (await send(path, { method: 'DELETE' })).text()
    return (text ? JSON.parse(text) : undefined) as T
  },
}
