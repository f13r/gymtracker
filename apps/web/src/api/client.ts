const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // For FormData bodies, let the browser set Content-Type (including the
  // multipart boundary). Forcing application/json here would corrupt uploads.
  const isFormData = options?.body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string }
    throw new Error(error.message ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: (path: string) =>
    fetch(`${BASE}${path}`, { method: 'DELETE' }).then(res => {
      if (!res.ok) {
        throw new Error(res.statusText)
      }
    }),
}
