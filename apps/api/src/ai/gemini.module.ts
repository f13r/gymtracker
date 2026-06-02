import { Module } from '@nestjs/common'

import { GeminiService } from './gemini.service'
import { AiLogModule } from '../ai-log/ai-log.module'

@Module({
  imports: [AiLogModule],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
