import { handleForbidden, handleUnauthorized } from '@/lib/auth-status'

const BASE = '/api'

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
    const error = (await res.json().catch(() => ({ message: res.statusText }))) as {
      message?: string
      email?: string
    }
    if (res.status === 401) {
      handleUnauthorized()
    } else if (res.status === 403) {
      handleForbidden(error.email ?? null)
    }
    throw new Error(error.message ?? 'Request failed')
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
  delete: async (path: string): Promise<void> => {
    await send(path, { method: 'DELETE' })
  },
}
