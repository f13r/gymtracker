import { Module } from '@nestjs/common'

import { CoachingKnowledgeService } from './coaching-knowledge.service'
import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  controllers: [ProgressionController],
  providers: [ProgressionService, CoachingKnowledgeService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
