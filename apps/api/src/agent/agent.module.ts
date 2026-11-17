import { Module } from '@nestjs/common'

import { AgentApplyService } from './agent-apply.service'
import { AgentExportService } from './agent-export.service'
import { IMAGE_CLIENT, nodeImageClient } from './agent-images'
import { AgentController } from './agent.controller'

@Module({
  controllers: [AgentController],
  providers: [AgentApplyService, AgentExportService, { provide: IMAGE_CLIENT, useValue: nodeImageClient }],
})
export class AgentModule {}
