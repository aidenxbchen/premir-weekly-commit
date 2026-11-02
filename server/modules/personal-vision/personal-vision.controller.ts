import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { PersonalVisionRecord } from '@shared/api.interface';
import { PersonalVisionService } from './personal-vision.service';

@Controller('api/personal-vision')
export class PersonalVisionController {
  constructor(private readonly service: PersonalVisionService) {}

  @Get('mine')
  @NeedLogin()
  async mine(@Req() req: Request): Promise<{ item: PersonalVisionRecord }> {
    return { item: await this.service.mine(req.userContext.userId) };
  }

  @Put('mine')
  @NeedLogin()
  async saveMine(@Req() req: Request, @Body() body: PersonalVisionRecord): Promise<{ item: PersonalVisionRecord }> {
    return { item: await this.service.saveMine(req.userContext.userId, body) };
  }
}
