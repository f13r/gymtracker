import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'

import { ACCESS_KEYS } from '../auth/access-keys'
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config'
import { AuthModule } from '../auth/auth.module'
import { DATABASE } from '../drizzle/drizzle.constants'
import type { ModuleMetadata } from '@nestjs/common'

/** Fake Cloudflare Access for tests: a local RS256 key pair standing in for the team's JWKS. */
export const TEST_TEAM_DOMAIN = 'https://test-team.cloudflareaccess.com'
export const TEST_AUD = '0123456789abcdef'.repeat(4)

export const cloudflareTestConfig: Extract<AuthConfig, { mode: 'cloudflare' }> = {
  mode: 'cloudflare',
  teamDomain: TEST_TEAM_DOMAIN,
  audience: TEST_AUD,
  agentTokenIds: [],
}

export async function createTestAccess() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' }] })

  type SignOptions = { iss?: string; aud?: string; exp?: number | string; key?: CryptoKey }
  /** An Access token as Cloudflare would issue it; override `iss` / `aud` / `exp` / `key` to break it. */
  const sign = (claims: JWTPayload, opts: SignOptions = {}) =>
    new SignJWT({ type: 'app', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.iss ?? TEST_TEAM_DOMAIN)
      .setAudience([opts.aud ?? TEST_AUD])
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey)

  return { jwks, sign }
}

/**
 * A Nest + Fastify app with the real AuthModule (its global guard included), the given config,
 * Access keys and database, plus whatever controllers/providers the test adds.
 */
export async function createAuthedApp(opts: {
  config: AuthConfig
  db: unknown
  keys?: unknown
  metadata?: ModuleMetadata
}): Promise<NestFastifyApplication> {
  const fakeDb = {
    module: class FakeDbModule {},
    global: true,
    providers: [{ provide: DATABASE, useValue: opts.db }],
    exports: [DATABASE],
  }
  const moduleRef = await Test.createTestingModule({
    ...opts.metadata,
    imports: [fakeDb, AuthModule, ...(opts.metadata?.imports ?? [])],
  })
    .overrideProvider(AUTH_CONFIG)
    .useValue(opts.config)
    .overrideProvider(ACCESS_KEYS)
    .useValue(opts.keys ?? null)
    .compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  app.setGlobalPrefix('api')
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}
