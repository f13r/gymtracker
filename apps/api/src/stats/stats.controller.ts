import { Controller, Get, Req, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get('prs') getPRs(@Req() req: any, @Query('exerciseId') exerciseId?: string, @Query('limit') limit?: string) {
    return this.svc.getPRs(req.user.id, exerciseId, limit ? parseInt(limit) : 10);
  }
  @Get('volume') getVolume(@Req() req: any, @Query('exerciseId') exerciseId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getVolume(req.user.id, exerciseId, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('streak') getStreak(@Req() req: any) { return this.svc.getStreak(req.user.id); }
  @Get('bodyweight') getBodyWeight(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getBodyWeight(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('measurements') getMeasurements(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getMeasurements(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('frequency') getFrequency(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getFrequency(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
}
