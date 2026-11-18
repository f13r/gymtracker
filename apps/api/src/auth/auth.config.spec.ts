import { describe, expect, it } from 'vitest'

import { athletesOf, loadAuthConfig, trainersOf } from './auth.config'

const TEAM = 'https://example-team.cloudflareaccess.com'
const AUD = 'a'.repeat(64)

describe('loadAuthConfig', () => {
  it('defaults to cloudflare mode and returns the team domain and AUD', () => {
    expect(loadAuthConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD })).toEqual({
      mode: 'cloudflare',
      teamDomain: TEAM,
      audience: AUD,
      agentTokenIds: [],
      trainerLinks: [],
    })
  })

  it('reads the Agent service-token client ids, with or without the .access suffix', () => {
    const config = loadAuthConfig({
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      CF_ACCESS_AUD: AUD,
      AGENT_SERVICE_TOKEN_IDS: ' abc123.access , def456,, ',
    })
    expect(config).toMatchObject({ agentTokenIds: ['abc123', 'def456'] })
  })

  it('refuses an Agent service-token id with spaces or other odd characters', () => {
    const env = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD, AGENT_SERVICE_TOKEN_IDS: 'abc 123' }
    expect(() => loadAuthConfig(env)).toThrow(/AGENT_SERVICE_TOKEN_IDS/)
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
    expect(loadAuthConfig({ AUTH_MODE: 'dev' })).toEqual({
      mode: 'dev',
      defaultUserId: 'default-user',
      trainerLinks: [],
    })
    expect(loadAuthConfig({ AUTH_MODE: 'dev', DEV_USER_ID: 'inna' })).toEqual({
      mode: 'dev',
      defaultUserId: 'inna',
      trainerLinks: [],
    })
  })

  it('refuses dev mode under NODE_ENV=production', () => {
    expect(() => loadAuthConfig({ AUTH_MODE: 'dev', NODE_ENV: 'production' })).toThrow(/production/)
  })
})

describe('TRAINER_LINKS', () => {
  const cf = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD }
  const load = (TRAINER_LINKS?: string, mode: 'cloudflare' | 'dev' = 'cloudflare') =>
    loadAuthConfig(mode === 'dev' ? { AUTH_MODE: 'dev', TRAINER_LINKS } : { ...cf, TRAINER_LINKS })

  it('parses TRAINER_LINKS in both modes', () => {
    const expected = [
      { trainerId: 'default-user', athleteId: 'inna' },
      { trainerId: 'a', athleteId: 'b' },
    ]
    expect(load(' default-user : inna ,a:b').trainerLinks).toEqual(expected)
    expect(load(' default-user : inna ,a:b', 'dev').trainerLinks).toEqual(expected)
    expect(load().trainerLinks).toEqual([])
    expect(load(undefined, 'dev').trainerLinks).toEqual([])
  })

  it('drops duplicate links', () => {
    expect(load('a:b,a:b').trainerLinks).toEqual([{ trainerId: 'a', athleteId: 'b' }])
  })

  it.each(['a', 'a:', ':b'])('refuses a malformed entry %j', entry => {
    expect(() => load(entry)).toThrow(/TRAINER_LINKS/)
  })

  it('refuses a self-link', () => {
    expect(() => load('a:a')).toThrow(/TRAINER_LINKS/)
  })

  it('athletesOf / trainersOf', () => {
    const cfg = load('a:b,a:c,d:b')
    expect(athletesOf(cfg, 'a')).toEqual(['b', 'c'])
    expect(trainersOf(cfg, 'b')).toEqual(['a', 'd'])
    expect(athletesOf(cfg, 'b')).toEqual([])
  })
})
