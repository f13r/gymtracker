/**
 * How requests are authenticated, read once at boot. Invalid config throws, so the API refuses to
 * start rather than run with auth half-configured.
 *
 * - `cloudflare` (default): every request must carry a Cloudflare Access JWT signed for
 *   `CF_ACCESS_TEAM_DOMAIN` (issuer, `https://<team>.cloudflareaccess.com`) and `CF_ACCESS_AUD`
 *   (the Access application's 64-hex AUD tag). `AGENT_SERVICE_TOKEN_IDS` (optional) lists the
 *   service-token client ids that act as the Agent, comma-separated (see `agentTokenId`).
 * - `dev`: no JWT. Requests act as `DEV_USER_ID` (default `default-user`), or as the User named in an
 *   `X-Dev-User` header. Refused when `NODE_ENV=production`.
 */
export type AuthConfig =
  | { mode: 'cloudflare'; teamDomain: string; audience: string; agentTokenIds: string[] }
  | { mode: 'dev'; defaultUserId: string }

export const AUTH_CONFIG = 'AUTH_CONFIG' as const

const TEAM_DOMAIN = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/
const AUD = /^[0-9a-f]{64}$/
const TOKEN_ID = /^[A-Za-z0-9._-]+$/

/**
 * A service token's client id as compared against `AGENT_SERVICE_TOKEN_IDS`: trimmed, with one
 * trailing `.access` dropped. Access puts `<client id>.access` in the JWT's `common_name`, and the
 * dashboard shows the id with the same suffix, so the env var may list either form. The rest must
 * match exactly (case-sensitive).
 */
export function agentTokenId(value: string): string {
  return value.trim().replace(/\.access$/, '')
}

export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const read = (key: string) => env[key]?.trim() ?? ''
  const mode = read('AUTH_MODE') || 'cloudflare'

  if (mode === 'dev') {
    if (read('NODE_ENV') === 'production') {
      throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production')
    }
    return { mode: 'dev', defaultUserId: read('DEV_USER_ID') || 'default-user' }
  }
  if (mode !== 'cloudflare') {
    throw new Error(`AUTH_MODE must be "cloudflare" or "dev"`)
  }

  const teamDomain = read('CF_ACCESS_TEAM_DOMAIN').replace(/\/$/, '')
  if (!TEAM_DOMAIN.test(teamDomain)) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN must be set to https://<team>.cloudflareaccess.com')
  }
  const audience = read('CF_ACCESS_AUD')
  if (!AUD.test(audience)) {
    throw new Error('CF_ACCESS_AUD must be set to the Access application AUD tag (64 lowercase hex characters)')
  }
  const agentTokenIds = read('AGENT_SERVICE_TOKEN_IDS')
    .split(',')
    .map(agentTokenId)
    .filter(Boolean)
  if (agentTokenIds.some(id => !TOKEN_ID.test(id))) {
    throw new Error('AGENT_SERVICE_TOKEN_IDS must be comma-separated service-token client ids')
  }
  return { mode: 'cloudflare', teamDomain, audience, agentTokenIds }
}
