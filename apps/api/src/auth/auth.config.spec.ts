import { describe, expect, it } from 'vitest'

import { loadAuthConfig } from './auth.config'

const TEAM = 'https://example-team.cloudflareaccess.com'
const AUD = 'a'.repeat(64)

describe('loadAuthConfig', () => {
  it('defaults to cloudflare mode and returns the team domain and AUD', () => {
    expect(loadAuthConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD })).toEqual({
      mode: 'cloudflare',
      teamDomain: TEAM,
      audience: AUD,
    })
  })

  it('drops a trailing slash from the team domain (the iss claim has none)', () => {
    const config = loadAuthConfig({ CF_ACCESS_TEAM_DOMAIN: `${TEAM}/`, CF_ACCESS_AUD: AUD })
    expect(config).toMatchObject({ teamDomain: TEAM })
  })

  it.each([
    ['team domain missing', { CF_ACCESS_AUD: AUD }],
    ['AUD missing', { CF_ACCESS_TEAM_DOMAIN: TEAM }],
    ['team domain empty', { CF_ACCESS_TEAM_DOMAIN: ' ', CF_ACCESS_AUD: AUD }],
    [
      'team domain over http',
      { CF_ACCESS_TEAM_DOMAIN: 'http://example-team.cloudflareaccess.com', CF_ACCESS_AUD: AUD },
    ],
    [
      'team domain not on cloudflareaccess.com',
      { CF_ACCESS_TEAM_DOMAIN: 'https://evil.example.com', CF_ACCESS_AUD: AUD },
    ],
    ['team domain with a path', { CF_ACCESS_TEAM_DOMAIN: `${TEAM}/cdn-cgi/access/certs`, CF_ACCESS_AUD: AUD }],
    ['team domain without scheme', { CF_ACCESS_TEAM_DOMAIN: 'example-team.cloudflareaccess.com', CF_ACCESS_AUD: AUD }],
    ['AUD too short', { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: 'a'.repeat(63) }],
    ['AUD not hex', { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: 'g'.repeat(64) }],
    ['explicit cloudflare mode without config', { AUTH_MODE: 'cloudflare' }],
  ])('refuses cloudflare mode when %s', (_, env) => {
    expect(() => loadAuthConfig(env)).toThrow(/CF_ACCESS/)
  })

  it('refuses an unknown AUTH_MODE', () => {
    expect(() => loadAuthConfig({ AUTH_MODE: 'off' })).toThrow(/AUTH_MODE/)
  })

  it('dev mode acts as default-user unless DEV_USER_ID says otherwise', () => {
    expect(loadAuthConfig({ AUTH_MODE: 'dev' })).toEqual({ mode: 'dev', defaultUserId: 'default-user' })
    expect(loadAuthConfig({ AUTH_MODE: 'dev', DEV_USER_ID: 'inna' })).toEqual({ mode: 'dev', defaultUserId: 'inna' })
  })

  it('refuses dev mode under NODE_ENV=production', () => {
    expect(() => loadAuthConfig({ AUTH_MODE: 'dev', NODE_ENV: 'production' })).toThrow(/production/)
  })
})
