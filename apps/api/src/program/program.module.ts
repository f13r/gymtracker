import { Module } from '@nestjs/common'

import { ProgramController } from './program.controller'
import { ProgramService } from './program.service'
import { GeminiModule } from '../ai/gemini.module'
import { ProgressionModule } from '../progression/progression.module'

@Module({
  imports: [ProgressionModule, GeminiModule],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
