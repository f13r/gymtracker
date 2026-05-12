import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    ctx
      .switchToHttp()
      .getResponse<{ header: (k: string, v: string) => void }>()
      .header('Cache-Control', 'private, no-store')
    return next.handle()
  }
}
