/**
 * How requests are authenticated, read once at boot. Invalid config throws, so the API refuses to
 * start rather than run with auth half-configured.
 *
 * - `cloudflare` (default): every request must carry a Cloudflare Access JWT signed for
 *   `CF_ACCESS_TEAM_DOMAIN` (issuer, `https://<team>.cloudflareaccess.com`) and `CF_ACCESS_AUD`
 *   (the Access application's 64-hex AUD tag).
 * - `dev`: no JWT. Requests act as `DEV_USER_ID` (default `default-user`), or as the User named in an
 *   `X-Dev-User` header. Refused when `NODE_ENV=production`.
 */
export type AuthConfig =
  | { mode: 'cloudflare'; teamDomain: string; audience: string }
  | { mode: 'dev'; defaultUserId: string }

export const AUTH_CONFIG = 'AUTH_CONFIG' as const

const TEAM_DOMAIN = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/
const AUD = /^[0-9a-f]{64}$/

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
  return { mode: 'cloudflare', teamDomain, audience }
}
