import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq, type SQL } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'

import type { AuthUser } from '@gymtracker/shared'

import { ACCESS_KEYS, type AccessKeys } from './access-keys'
import { AUTH_CONFIG, type AuthConfig } from './auth.config'
import { IS_PUBLIC } from './public.decorator'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { FastifyRequest } from 'fastify'

const CLOCK_TOLERANCE_SECONDS = 60
// jose errors that mean "we could not get the keys", not "the token is bad".
const KEYS_UNAVAILABLE = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'])

type CloudflareConfig = Extract<AuthConfig, { mode: 'cloudflare' }>

/**
 * Who is calling, before it is resolved to a User. A new kind (the Agent, phase E) is a new member
 * here plus a branch in `resolve`.
 */
type Principal =
  | { kind: 'email'; email: string } // a person signed in through Access
  | { kind: 'service-token'; commonName: string } // a non-browser Access client
  | { kind: 'dev'; userId: string } // AUTH_MODE=dev
  | { kind: 'anonymous' } // a valid token naming no identity

/**
 * The global guard: every route needs a signed-in User unless marked `@Public()`.
 *
 * In `cloudflare` mode the `Cf-Access-Jwt-Assertion` header must hold a valid Access JWT (else 401),
 * and its email must belong to a User (else 403 with that email). In `dev` mode the User is
 * `X-Dev-User` or `DEV_USER_ID`. Never logs tokens or emails.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('Auth')

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(ACCESS_KEYS) private readonly keys: AccessKeys,
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      return true
    }
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>()
    req.user = await this.resolve(await this.principalOf(req))
    return true
  }

  private async principalOf(req: FastifyRequest): Promise<Principal> {
    if (this.config.mode === 'dev') {
      const header = req.headers['x-dev-user']
      const userId = typeof header === 'string' && header.trim() ? header.trim() : this.config.defaultUserId
      return { kind: 'dev', userId }
    }
    const token = req.headers['cf-access-jwt-assertion']
    if (typeof token !== 'string' || !token || !this.keys) {
      throw new UnauthorizedException()
    }
    const claims = await this.verify(token, this.keys, this.config)
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
    if (email) {
      return { kind: 'email', email }
    }
    if (typeof claims.common_name === 'string' && claims.common_name) {
      return { kind: 'service-token', commonName: claims.common_name }
    }
    return { kind: 'anonymous' }
  }

  private async resolve(principal: Principal): Promise<AuthUser> {
    switch (principal.kind) {
      case 'email': {
        const user = await this.findUser(eq(schema.users.email, principal.email))
        if (!user) {
          this.logger.warn('Refused a verified Access login whose email is not a User')
          throw new ForbiddenException({ statusCode: 403, message: 'Not authorised', email: principal.email })
        }
        return user
      }
      case 'dev': {
        const user = await this.findUser(eq(schema.users.id, principal.userId))
        if (!user) {
          throw new ForbiddenException({ statusCode: 403, message: 'Not authorised' })
        }
        return user
      }
      case 'service-token':
      case 'anonymous':
        // Service tokens get their own identity (the Agent) later; until then they are no User.
        this.logger.warn(`Refused a verified Access token with no User identity (${principal.kind})`)
        throw new ForbiddenException({ statusCode: 403, message: 'Not authorised' })
    }
  }

  private async findUser(where: SQL): Promise<AuthUser | undefined> {
    try {
      const [user] = await this.db
        .select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users)
        .where(where)
        .limit(1)
      return user
    } catch (err) {
      // A failed query's message carries its parameters (an email), so log only the error's name.
      this.logger.error(`User lookup failed (${err instanceof Error ? err.name : 'unknown'})`)
      throw new ServiceUnavailableException()
    }
  }

  /**
   * The verified claims, or 401. Errors are rethrown as plain HttpExceptions: jose's errors carry the
   * token payload (email included), which Nest would otherwise log.
   */
  private async verify(token: string, keys: JWTVerifyGetKey, config: CloudflareConfig): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: config.teamDomain,
        audience: config.audience,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      })
      return payload
    } catch (err) {
      if (err instanceof errors.JOSEError && !KEYS_UNAVAILABLE.has(err.code)) {
        throw new UnauthorizedException()
      }
      // The JWKS could not be fetched or read: not the caller's fault, and every request fails until
      // it recovers, so say so loudly. Only the error's name/code is logged.
      const reason = err instanceof errors.JOSEError ? err.code : err instanceof Error ? err.name : 'unknown'
      this.logger.error(`Cloudflare Access keys unavailable (${reason})`)
      throw new ServiceUnavailableException()
    }
  }
}
