import { Module } from '@nestjs/common'
import { ProgressionModule } from '../progression/progression.module'
import { GeminiModule } from '../ai/gemini.module'
import { ProgramController } from './program.controller'
import { ProgramService } from './program.service'

@Module({
  imports: [ProgressionModule, GeminiModule],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
