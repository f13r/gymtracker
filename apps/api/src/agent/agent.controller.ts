import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Query, Res } from '@nestjs/common'

import { AgentDocumentSchema, agentDocumentJsonSchema } from '@gymtracker/shared'

import { AgentApplyService } from './agent-apply.service'
import { AgentExportService } from './agent-export.service'
import { AgentOnly } from '../auth/agent-only.decorator'
import type { FastifyReply } from 'fastify'

function intParam(raw: string | undefined, name: string, fallback: number, max: number): number {
  if (raw === undefined || raw === '') {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BadRequestException(`${name} must be a whole number from 1 to ${max}`)
  }
  return value
}

/**
 * The Agent's entry point (CONTEXT.md "Agent"): read the library and a User's plan, then apply a
 * document of changes, dry-run unless `confirm=true`.
 */
@AgentOnly()
@Controller('agent')
export class AgentController {
  constructor(
    @Inject(AgentApplyService) private readonly applier: AgentApplyService,
    @Inject(AgentExportService) private readonly exporter: AgentExportService,
  ) {}

  @Get('schema')
  schema() {
    return agentDocumentJsonSchema()
  }

  @Get('export')
  export(@Query('user') user?: string, @Query('weeks') weeks?: string) {
    return this.exporter.export({ userId: user?.trim() || undefined, weeks: intParam(weeks, 'weeks', 8, 104) })
  }

  @Get('changes')
  changes(@Query('limit') limit?: string, @Query('user') user?: string) {
    return this.exporter.changes(intParam(limit, 'limit', 20, 200), user?.trim() || undefined)
  }

  /** 200 with the diff; 422 with the diff when the document has errors (then nothing is written). */
  @Post('apply')
  @HttpCode(200)
  async apply(@Body() body: unknown, @Query('confirm') confirm: string | undefined, @Res() res: FastifyReply) {
    const parsed = AgentDocumentSchema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid document; see GET /api/agent/schema',
        errors: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    const result = await this.applier.apply(parsed.data, confirm === 'true')
    return res.status(result.errors.length > 0 ? 422 : 200).send(result)
  }
}
