import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'auth:isPublic'

/** Opens a route (or a whole controller) to unauthenticated callers. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
