import { Controller, Get, Logger } from '@nestjs/common'
import { type NestFastifyApplication } from '@nestjs/platform-fastify'
import { generateKeyPair, UnsecuredJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentOnly } from './agent-only.decorator'
import * as schema from '../drizzle/schema'
import { HealthController } from '../health.controller'
import { cloudflareTestConfig, createAuthedApp, createTestAccess } from '../testing/access-tokens'
import { createFakeDb } from '../testing/fake-db'

const ME = { method: 'GET' as const, url: '/api/me' }

function seedUsers() {
  const db = createFakeDb()
  db.seed(schema.users, { id: 'u1', displayName: 'User One', email: 'one@example.com', createdAt: 0 })
  db.seed(schema.users, { id: 'u2', displayName: 'User Two', email: 'two@example.com', createdAt: 0 })
  return db
}

describe('Cloudflare Access guard', () => {
  let app: NestFastifyApplication
  let access: Awaited<ReturnType<typeof createTestAccess>>
  const withToken = (token: string) => ({ ...ME, headers: { 'cf-access-jwt-assertion': token } })

  beforeAll(async () => {
    access = await createTestAccess()
    app = await createAuthedApp({ config: cloudflareTestConfig, db: seedUsers(), keys: access.jwks })
  })

  afterAll(async () => {
    await app.close()
  })

  it('resolves a valid token to the User with that email (case and spaces ignored)', async () => {
    const res = await app.inject(withToken(await access.sign({ email: ' Two@Example.com ' })))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'u2', displayName: 'User Two' })
  })

  it('answers 401 without the Cf-Access-Jwt-Assertion header', async () => {
    const res = await app.inject(ME)
    expect(res.statusCode).toBe(401)
  })

  it('answers 401 for a token that is not a JWT', async () => {
    const res = await app.inject(withToken('garbage'))
    expect(res.statusCode).toBe(401)
  })

  it('answers 401 for a token for another Access application (wrong aud)', async () => {
    const res = await app.inject(withToken(await access.sign({ email: 'one@example.com' }, { aud: 'f'.repeat(64) })))
    expect(res.statusCode).toBe(401)
  })

  it('answers 401 for a token from another team (wrong iss)', async () => {
    const iss = 'https://other-team.cloudflareaccess.com'
    const res = await app.inject(withToken(await access.sign({ email: 'one@example.com' }, { iss })))
    expect(res.statusCode).toBe(401)
  })

  it('answers 401 for an expired token (beyond the clock tolerance)', async () => {
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120
    const res = await app.inject(withToken(await access.sign({ email: 'one@example.com' }, { exp: twoMinutesAgo })))
    expect(res.statusCode).toBe(401)
  })

  it('accepts a token that expired within the 60 s clock tolerance', async () => {
    const tenSecondsAgo = Math.floor(Date.now() / 1000) - 10
    const res = await app.inject(withToken(await access.sign({ email: 'one@example.com' }, { exp: tenSecondsAgo })))
    expect(res.statusCode).toBe(200)
  })

  it('answers 401 for a token signed by a key that is not in the JWKS', async () => {
    const { privateKey } = await generateKeyPair('RS256')
    const res = await app.inject(withToken(await access.sign({ email: 'one@example.com' }, { key: privateKey })))
    expect(res.statusCode).toBe(401)
  })

  it('answers 401 for an unsigned (alg none) token', async () => {
    const res = await app.inject(withToken(new UnsecuredJWT({ email: 'one@example.com' }).encode()))
    expect(res.statusCode).toBe(401)
  })

  it('answers 403 with the email for a valid token whose email is not a User', async () => {
    const res = await app.inject(withToken(await access.sign({ email: 'Stranger@Example.com' })))
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', email: 'stranger@example.com' })
  })

  it('answers 403 for a service-token JWT (no email, common_name set): the Agent is not a User', async () => {
    const res = await app.inject(withToken(await access.sign({ sub: '', common_name: 'client-id.access' })))
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised' })
  })

  it('answers 403 for a valid token that names no identity at all', async () => {
    const res = await app.inject(withToken(await access.sign({ email: '  ' })))
    expect(res.statusCode).toBe(403)
  })
})

describe('Cloudflare Access guard when the keys cannot be fetched', () => {
  it('answers 503 (not 200, not 401) and does not log the token', async () => {
    const access = await createTestAccess()
    const unreachable = () => Promise.reject(new TypeError('fetch failed'))
    const app = await createAuthedApp({ config: cloudflareTestConfig, db: seedUsers(), keys: unreachable })
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    try {
      const token = await access.sign({ email: 'one@example.com' })
      const res = await app.inject({ ...ME, headers: { 'cf-access-jwt-assertion': token } })
      expect(res.statusCode).toBe(503)
      const logged = JSON.stringify(errorLog.mock.calls)
      expect(logged).toContain('keys unavailable')
      expect(logged).not.toContain(token)
      expect(logged).not.toContain('one@example.com')
    } finally {
      errorLog.mockRestore()
      await app.close()
    }
  })
})

describe('Public routes', () => {
  it('GET /api/health answers without a token', async () => {
    const app = await createAuthedApp({
      config: cloudflareTestConfig,
      db: seedUsers(),
      keys: (await createTestAccess()).jwks,
      metadata: { controllers: [HealthController] },
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
      expect((await app.inject(ME)).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
})

describe('AUTH_MODE=dev', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await createAuthedApp({ config: { mode: 'dev', defaultUserId: 'u1', trainerLinks: [] }, db: seedUsers() })
  })

  afterAll(async () => {
    await app.close()
  })

  it('acts as DEV_USER_ID without any token', async () => {
    const res = await app.inject(ME)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'u1', displayName: 'User One' })
  })

  it('acts as the User named in X-Dev-User', async () => {
    const res = await app.inject({ ...ME, headers: { 'x-dev-user': 'u2' } })
    expect(res.json()).toEqual({ id: 'u2', displayName: 'User Two' })
  })

  it('answers 403 when X-Dev-User names no User', async () => {
    const res = await app.inject({ ...ME, headers: { 'x-dev-user': 'nobody' } })
    expect(res.statusCode).toBe(403)
  })

  it('ignores Access tokens: a token cannot pick the User in dev mode', async () => {
    const access = await createTestAccess()
    const token = await access.sign({ email: 'two@example.com' })
    const res = await app.inject({ ...ME, headers: { 'cf-access-jwt-assertion': token } })
    expect(res.json()).toEqual({ id: 'u1', displayName: 'User One' })
  })
})

@AgentOnly()
@Controller('agent-probe')
class AgentProbeController {
  @Get() probe() {
    return { ok: true }
  }
}

describe('the Agent: only on @AgentOnly routes, and only the Agent there', () => {
  const AGENT_PROBE = { method: 'GET' as const, url: '/api/agent-probe' }

  describe('through Cloudflare Access', () => {
    let app: NestFastifyApplication
    let access: Awaited<ReturnType<typeof createTestAccess>>
    const as = (req: typeof ME, token: string) => ({ ...req, headers: { 'cf-access-jwt-assertion': token } })
    const serviceToken = (commonName: string) => access.sign({ sub: '', common_name: commonName })

    beforeAll(async () => {
      access = await createTestAccess()
      app = await createAuthedApp({
        config: { ...cloudflareTestConfig, agentTokenIds: ['agent-client-id'] },
        db: seedUsers(),
        keys: access.jwks,
        metadata: { controllers: [AgentProbeController] },
      })
    })

    afterAll(async () => {
      await app.close()
    })

    it('lets a listed service token (common_name "<id>.access") call an Agent route', async () => {
      const res = await app.inject(as(AGENT_PROBE, await serviceToken('agent-client-id.access')))
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    })

    it('accepts a common_name without the .access suffix too', async () => {
      expect((await app.inject(as(AGENT_PROBE, await serviceToken('agent-client-id')))).statusCode).toBe(200)
    })

    it('refuses the Agent on every other route (403)', async () => {
      const res = await app.inject(as(ME, await serviceToken('agent-client-id.access')))
      expect(res.statusCode).toBe(403)
    })

    it('refuses an unlisted service token everywhere (403)', async () => {
      const token = await serviceToken('other-client.access')
      expect((await app.inject(as(AGENT_PROBE, token))).statusCode).toBe(403)
      expect((await app.inject(as(ME, token))).statusCode).toBe(403)
    })

    it('refuses a near-miss id (prefix, other case, doubled suffix)', async () => {
      for (const commonName of ['agent-client-i.access', 'AGENT-CLIENT-ID.access', 'agent-client-id.access.access']) {
        expect((await app.inject(as(AGENT_PROBE, await serviceToken(commonName)))).statusCode).toBe(403)
      }
    })

    it('refuses a signed-in User on an Agent route (403)', async () => {
      const token = await access.sign({ email: 'one@example.com' })
      expect((await app.inject(as(AGENT_PROBE, token))).statusCode).toBe(403)
      expect((await app.inject(as(ME, token))).statusCode).toBe(200)
    })

    it('still needs a token on an Agent route (401)', async () => {
      expect((await app.inject(AGENT_PROBE)).statusCode).toBe(401)
    })
  })

  describe('AUTH_MODE=dev', () => {
    let app: NestFastifyApplication

    beforeAll(async () => {
      app = await createAuthedApp({
        config: { mode: 'dev', defaultUserId: 'u1', trainerLinks: [] },
        db: seedUsers(),
        metadata: { controllers: [AgentProbeController] },
      })
    })

    afterAll(async () => {
      await app.close()
    })

    it('X-Dev-Agent: 1 acts as the Agent, and only on Agent routes', async () => {
      expect((await app.inject({ ...AGENT_PROBE, headers: { 'x-dev-agent': '1' } })).statusCode).toBe(200)
      expect((await app.inject({ ...ME, headers: { 'x-dev-agent': '1' } })).statusCode).toBe(403)
    })

    it('without the header the dev User is refused on Agent routes', async () => {
      expect((await app.inject(AGENT_PROBE)).statusCode).toBe(403)
    })
  })
})
