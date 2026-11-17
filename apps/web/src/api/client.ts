import { handleForbidden, handleUnauthorized } from '@/lib/auth-status'

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
async function send(path: string, options: RequestInit = {}): Promise<Response> {
  // For FormData bodies, let the browser set Content-Type (including the
  // multipart boundary). Forcing application/json here would corrupt uploads.
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => ({ message: res.statusText }))
    const error = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
    if (res.status === 401) {
      handleUnauthorized()
    } else if (res.status === 403) {
      handleForbidden(typeof error.email === 'string' ? error.email : null)
    }
    const message = typeof error.message === 'string' && error.message ? error.message : 'Request failed'
    throw new ApiError(res.status, error, message)
  }
  return res
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await send(path, options)
  return res.json() as Promise<T>
}

const body = (value: unknown) => (value instanceof FormData ? value : JSON.stringify(value))

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, value: unknown) => request<T>(path, { method: 'POST', body: body(value) }),
  patch: <T>(path: string, value: unknown) => request<T>(path, { method: 'PATCH', body: body(value) }),
  // Most DELETEs answer with an empty body; some (e.g. /exercises/:id) report what happened.
  delete: async <T = void>(path: string): Promise<T> => {
    const text = await (await send(path, { method: 'DELETE' })).text()
    return (text ? JSON.parse(text) : undefined) as T
  },
}
