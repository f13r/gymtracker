import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { downloadImage, MAX_IMAGE_BYTES, type ImageFetch } from './agent-images'

const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
    .png()
    .toBuffer()

/** A fake web: each URL answers with the given response. */
function web(routes: Record<string, () => Response | Promise<Response>>): ImageFetch & { calls: string[] } {
  const calls: string[] = []
  const fetchFn = vi.fn((url: string) => {
    calls.push(url)
    const route = routes[url]
    return route ? Promise.resolve(route()) : Promise.resolve(new Response('not found', { status: 404 }))
  })
  return Object.assign(fetchFn, { calls })
}

const image = async () => new Response(new Uint8Array(await png()), { headers: { 'content-type': 'image/png' } })

describe('downloadImage', () => {
  it('downloads an https image', async () => {
    const fetchFn = web({ 'https://img.example.com/a.png': image })
    const buf = await downloadImage(fetchFn, 'https://img.example.com/a.png')
    expect((await sharp(buf).metadata()).format).toBe('png')
  })

  it('follows an https redirect, but never one to http', async () => {
    const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } })
    const ok = web({
      'https://a.example.com/x': redirect('https://b.example.com/y.png'),
      'https://b.example.com/y.png': image,
    })
    await expect(downloadImage(ok, 'https://a.example.com/x')).resolves.toBeInstanceOf(Buffer)

    const bad = web({ 'https://a.example.com/x': redirect('http://b.example.com/y.png') })
    await expect(downloadImage(bad, 'https://a.example.com/x')).rejects.toThrow(/https/)
  })

  it.each([
    ['http', 'http://img.example.com/a.png', /https/],
    ['localhost', 'https://localhost/a.png', /private/],
    ['a loopback IP', 'https://127.0.0.1/a.png', /private/],
    ['a LAN IP', 'https://192.168.50.1/a.png', /private/],
    ['an IPv6 loopback', 'https://[::1]/a.png', /private/],
  ])('refuses %s without fetching', async (_, url, message) => {
    const fetchFn = web({})
    await expect(downloadImage(fetchFn, url)).rejects.toThrow(message)
    expect(fetchFn.calls).toEqual([])
  })

  it('refuses a response that is not an image', async () => {
    const fetchFn = web({
      'https://x.example.com/p': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    })
    await expect(downloadImage(fetchFn, 'https://x.example.com/p')).rejects.toThrow(/Not an image/)
  })

  it('refuses an HTTP error', async () => {
    await expect(downloadImage(web({}), 'https://x.example.com/missing.png')).rejects.toThrow(/HTTP 404/)
  })

  it('refuses an image over 10 MB, even without a Content-Length', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    const stream = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(big)
            c.close()
          },
        }),
        { headers: { 'content-type': 'image/png' } },
      )
    await expect(
      downloadImage(web({ 'https://x.example.com/big.png': stream }), 'https://x.example.com/big.png'),
    ).rejects.toThrow(/10 MB/)
  })
})
