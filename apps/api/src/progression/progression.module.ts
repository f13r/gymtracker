import { Module } from '@nestjs/common'

import { GeminiModule } from '../ai/gemini.module'
import { CoachingKnowledgeService } from './coaching-knowledge.service'
import { ExerciseHistoryService } from './exercise-history.service'
import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  imports: [GeminiModule],
  controllers: [ProgressionController],
  providers: [ProgressionService, CoachingKnowledgeService, ExerciseHistoryService],
  exports: [ProgressionService, CoachingKnowledgeService],
})
export class ProgressionModule {}
