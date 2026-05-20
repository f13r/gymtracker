import { Module } from '@nestjs/common'
import { ProgressionModule } from '../progression/progression.module'
import { ProgramController } from './program.controller'
import { ProgramService } from './program.service'

@Module({
  imports: [ProgressionModule],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
