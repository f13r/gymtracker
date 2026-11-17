import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  downloadImage,
  isBlockedAddress,
  MAX_IMAGE_BYTES,
  pinnedLookup,
  type ImageClient,
  type ImageRequest,
} from './agent-images'

const png = async () =>
  new Uint8Array(
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
      .png()
      .toBuffer(),
  )
const image = async () => new Response(await png(), { headers: { 'content-type': 'image/png' } })
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } })

const PUBLIC_IP = '93.184.215.14'

/**
 * A fake internet: `dns` maps host names to addresses (default: one public address), `routes`
 * maps URLs to responses. Records each request with the address it was pinned to.
 */
function fakeNet(
  routes: Record<string, () => Response | Promise<Response>>,
  dns: Record<string, string[]> = {},
): ImageClient & { requests: { url: string; address: string }[] } {
  const requests: { url: string; address: string }[] = []
  return {
    requests,
    resolve: hostname =>
      Promise.resolve(
        (dns[hostname] ?? [PUBLIC_IP]).map(address => ({ address, family: address.includes(':') ? 6 : 4 })),
      ),
    fetch: (req: ImageRequest) => {
      requests.push({ url: req.url.toString(), address: req.address.address })
      const route = routes[req.url.toString()]
      return Promise.resolve(route ? route() : new Response('not found', { status: 404 }))
    },
  }
}

describe('downloadImage', () => {
  it('downloads an https image from a public address, over a connection pinned to that address', async () => {
    const net = fakeNet({ 'https://img.example.com/a.png': image })
    const buf = await downloadImage(net, 'https://img.example.com/a.png')
    expect((await sharp(buf).metadata()).format).toBe('png')
    expect(net.requests).toEqual([{ url: 'https://img.example.com/a.png', address: PUBLIC_IP }])
  })

  it('refuses a public name that resolves to a loopback address, without connecting', async () => {
    const net = fakeNet({ 'https://evil.example.com/a.png': image }, { 'evil.example.com': ['127.0.0.1'] })
    await expect(downloadImage(net, 'https://evil.example.com/a.png')).rejects.toThrow(/private/)
    expect(net.requests).toEqual([])
  })

  it('refuses a name when any of its addresses is private', async () => {
    const net = fakeNet({}, { 'mixed.example.com': [PUBLIC_IP, '10.1.2.3'] })
    await expect(downloadImage(net, 'https://mixed.example.com/a.png')).rejects.toThrow(/private/)
    expect(net.requests).toEqual([])
  })

  it('refuses a name that does not resolve', async () => {
    const net = fakeNet({}, { 'nowhere.example.com': [] })
    await expect(downloadImage(net, 'https://nowhere.example.com/a.png')).rejects.toThrow(/resolve/)
  })

  it('checks every redirect hop: an https redirect to a public host is followed', async () => {
    const net = fakeNet({
      'https://a.example.com/x': redirect('https://b.example.com/y.png'),
      'https://b.example.com/y.png': image,
    })
    await expect(downloadImage(net, 'https://a.example.com/x')).resolves.toBeInstanceOf(Buffer)
    expect(net.requests.map(r => r.url)).toEqual(['https://a.example.com/x', 'https://b.example.com/y.png'])
  })

  it('refuses a redirect to a host that resolves to a private address', async () => {
    const net = fakeNet(
      { 'https://a.example.com/x': redirect('https://internal.example.com/y.png') },
      { 'internal.example.com': ['192.168.50.69'] },
    )
    await expect(downloadImage(net, 'https://a.example.com/x')).rejects.toThrow(/private/)
    expect(net.requests.map(r => r.url)).toEqual(['https://a.example.com/x'])
  })

  it('refuses a redirect to a private IP literal or to http', async () => {
    const toIp = fakeNet({ 'https://a.example.com/x': redirect('https://169.254.169.254/latest') })
    await expect(downloadImage(toIp, 'https://a.example.com/x')).rejects.toThrow(/private/)
    const toHttp = fakeNet({ 'https://a.example.com/x': redirect('http://b.example.com/y.png') })
    await expect(downloadImage(toHttp, 'https://a.example.com/x')).rejects.toThrow(/https/)
  })

  it('stops after a few redirects', async () => {
    const net = fakeNet({
      'https://a.example.com/1': redirect('https://a.example.com/2'),
      'https://a.example.com/2': redirect('https://a.example.com/3'),
      'https://a.example.com/3': redirect('https://a.example.com/4'),
      'https://a.example.com/4': redirect('https://a.example.com/5'),
      'https://a.example.com/5': image,
    })
    await expect(downloadImage(net, 'https://a.example.com/1')).rejects.toThrow(/redirects/)
  })

  it.each([
    ['http', 'http://img.example.com/a.png', /https/],
    ['localhost', 'https://localhost/a.png', /private/],
    ['a loopback IP', 'https://127.0.0.1/a.png', /private/],
    ['a LAN IP', 'https://192.168.50.1/a.png', /private/],
    ['an IPv6 loopback', 'https://[::1]/a.png', /private/],
    ['an IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/a.png', /private/],
  ])('refuses %s without connecting', async (_, url, message) => {
    const net = fakeNet({})
    await expect(downloadImage(net, url)).rejects.toThrow(message)
    expect(net.requests).toEqual([])
  })

  it('refuses a response that is not an image', async () => {
    const net = fakeNet({
      'https://x.example.com/p': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    })
    await expect(downloadImage(net, 'https://x.example.com/p')).rejects.toThrow(/Not an image/)
  })

  it('refuses an HTTP error', async () => {
    await expect(downloadImage(fakeNet({}), 'https://x.example.com/missing.png')).rejects.toThrow(/HTTP 404/)
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
    const net = fakeNet({ 'https://x.example.com/big.png': stream })
    await expect(downloadImage(net, 'https://x.example.com/big.png')).rejects.toThrow(/10 MB/)
  })
})

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.50.69',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a00:1',
    '::127.0.0.1',
    '64:ff9b::a9fe:a9fe',
  ])('blocks %s', address => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each(['93.184.215.14', '8.8.8.8', '100.128.0.1', '172.32.0.1', '2606:4700::6810:84e5', '::ffff:8.8.8.8'])(
    'allows %s',
    address => {
      expect(isBlockedAddress(address)).toBe(false)
    },
  )
})

describe('pinnedLookup', () => {
  it('answers every lookup with the vetted address, whatever name is asked', () => {
    const lookup = pinnedLookup({ address: PUBLIC_IP, family: 4 })
    const one: unknown[] = []
    lookup('rebound.example.com', {}, (...args: unknown[]) => one.push(args))
    expect(one).toEqual([[null, PUBLIC_IP, 4]])
    const all: unknown[] = []
    lookup('rebound.example.com', { all: true }, (...args: unknown[]) => all.push(args))
    expect(all).toEqual([[null, [{ address: PUBLIC_IP, family: 4 }]]])
  })
})
