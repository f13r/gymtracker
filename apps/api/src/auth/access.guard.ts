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
import { IS_AGENT_ONLY } from './agent-only.decorator'
import { AUTH_CONFIG, agentTokenId, athletesOf, type AuthConfig } from './auth.config'
import { IS_PUBLIC } from './public.decorator'
import type { AuthenticatedRequest } from './request.types'
import { TRAINER_ACCESS, type TrainerAccessLevel } from './trainer-access.decorator'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { FastifyRequest } from 'fastify'

const CLOCK_TOLERANCE_SECONDS = 60
// jose errors that mean "we could not get the keys", not "the token is bad".
const KEYS_UNAVAILABLE = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'])

type CloudflareConfig = Extract<AuthConfig, { mode: 'cloudflare' }>

/**
 * Who is calling, before it is resolved to a User. A new kind is a new member here plus a branch in
 * `resolve`.
 */
type Principal =
  | { kind: 'email'; email: string } // a person signed in through Access
  | { kind: 'agent' } // a service token listed in AGENT_SERVICE_TOKEN_IDS, or X-Dev-Agent in dev
  | { kind: 'service-token'; commonName: string } // any other non-browser Access client
  | { kind: 'dev'; userId: string } // AUTH_MODE=dev
  | { kind: 'anonymous' } // a valid token naming no identity

/**
 * The global guard: every route needs a signed-in User unless marked `@Public()`.
 *
 * In `cloudflare` mode the `Cf-Access-Jwt-Assertion` header must hold a valid Access JWT (else 401),
 * and its email must belong to a User (else 403 with that email). In `dev` mode the User is
 * `X-Dev-User` or `DEV_USER_ID`. Never logs tokens or emails.
 *
 * The Agent (CONTEXT.md) is not a User: it may call only `@AgentOnly()` routes, which nobody else
 * may call (403 both ways). Its requests carry no `req.user`.
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
    const req = ctx.switchToHttp().getRequest<FastifyRequest & Partial<AuthenticatedRequest>>()
    const principal = await this.principalOf(req)
    const agentRoute = this.reflector.getAllAndOverride<boolean>(IS_AGENT_ONLY, [ctx.getHandler(), ctx.getClass()])
    if (principal.kind === 'agent' || agentRoute) {
      if (principal.kind !== 'agent' || !agentRoute) {
        this.logger.warn(principal.kind === 'agent' ? 'Refused the Agent off its routes' : 'Refused a non-Agent caller')
        throw new ForbiddenException({ statusCode: 403, message: 'Not authorised' })
      }
      return true
    }
    req.user = await this.resolve(principal)
    await this.actAsAthlete(ctx, req as AuthenticatedRequest)
    return true
  }

  /**
   * `X-Act-As: <athleteId>` (CONTEXT.md, "Acting as"): a Trainer with a link to that athlete, on a
   * route marked `@TrainerAccess`, runs as the athlete. `req.user` becomes the athlete and
   * `req.actor` keeps the Trainer. Absent, empty or the caller's own id means no acting.
   */
  private async actAsAthlete(ctx: ExecutionContext, req: AuthenticatedRequest): Promise<void> {
    const header = req.headers['x-act-as']
    const athleteId = typeof header === 'string' ? header.trim() : ''
    const trainer = req.user
    if (!athleteId || athleteId === trainer.id) {
      return
    }
    if (!athletesOf(this.config, trainer.id).includes(athleteId)) {
      this.logger.warn(`Refused ${trainer.id} acting as a non-athlete`)
      throw new ForbiddenException({ statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
    }
    const level = this.reflector.getAllAndOverride<TrainerAccessLevel | undefined>(TRAINER_ACCESS, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!level) {
      this.logger.warn(`Refused ${trainer.id} acting as ${athleteId} on ${req.method} ${req.routeOptions.url}`)
      throw new ForbiddenException({ statusCode: 403, message: 'Not authorised', reason: 'trainer-access' })
    }
    if (level === 'read' && req.method !== 'GET') {
      // A `'read'` mark on a non-GET route is a classification mistake: refuse rather than write.
      this.logger.warn(
        `Refused ${trainer.id} acting as ${athleteId} on read-only ${req.method} ${req.routeOptions.url}`,
      )
      throw new ForbiddenException({ statusCode: 403, message: 'Not authorised', reason: 'trainer-access' })
    }
    const athlete = await this.findUser(eq(schema.users.id, athleteId))
    if (!athlete) {
      // A link to someone who is no User: treated as no link.
      this.logger.warn(`Refused ${trainer.id} acting as ${athleteId}, who is no User`)
      throw new ForbiddenException({ statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
    }
    this.logger.debug(`Acting: ${trainer.id} as ${athlete.id} ${req.method} ${req.routeOptions.url}`)
    req.actor = trainer
    req.user = athlete
  }

  private async principalOf(req: FastifyRequest): Promise<Principal> {
    if (this.config.mode === 'dev') {
      if (req.headers['x-dev-agent'] === '1') {
        return { kind: 'agent' }
      }
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
      const id = agentTokenId(claims.common_name)
      return this.config.agentTokenIds.includes(id)
        ? { kind: 'agent' }
        : { kind: 'service-token', commonName: claims.common_name }
    }
    return { kind: 'anonymous' }
  }

  private async resolve(principal: Exclude<Principal, { kind: 'agent' }>): Promise<AuthUser> {
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
        // A service token not listed as the Agent is nobody.
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
