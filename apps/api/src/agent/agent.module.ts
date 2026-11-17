import { Module } from '@nestjs/common'

import { AgentApplyService } from './agent-apply.service'
import { AgentExportService } from './agent-export.service'
import { IMAGE_FETCH, type ImageFetch } from './agent-images'
import { AgentController } from './agent.controller'

@Module({
  controllers: [AgentController],
  providers: [
    AgentApplyService,
    AgentExportService,
    { provide: IMAGE_FETCH, useValue: ((url, init) => fetch(url, init)) satisfies ImageFetch },
  ],
})
export class AgentModule {}
