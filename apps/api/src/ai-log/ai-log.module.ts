import { Global, Module } from '@nestjs/common'

import { AiLogController } from './ai-log.controller'
import { AiLogService } from './ai-log.service'

@Global()
@Module({
  controllers: [AiLogController],
  providers: [AiLogService],
  exports: [AiLogService],
})
export class AiLogModule {}
