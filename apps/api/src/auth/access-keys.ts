import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

import type { AuthConfig } from './auth.config'

/** The keys Access JWTs are verified against; `null` in dev mode (no JWTs). Tests inject a local set. */
export type AccessKeys = JWTVerifyGetKey | null

export const ACCESS_KEYS = 'ACCESS_KEYS' as const

/**
 * The team's JWKS (`<team domain>/cdn-cgi/access/certs`). Created once per process: jose caches the
 * keys and refetches on an unknown `kid`, which covers Cloudflare's key rotation.
 */
export function remoteAccessKeys(config: AuthConfig): AccessKeys {
  return config.mode === 'cloudflare' ? createRemoteJWKSet(new URL(`${config.teamDomain}/cdn-cgi/access/certs`)) : null
}
