import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { CommentsService } from './comments.service';
import { RosterService } from '../roster/roster.service';
import type { CommentDiscussion, CommentInboxResponse, ReadCommentsRequest, CommentCountsResponse, CreateCommentRequest, ListCommentsResponse } from '@shared/api.interface';

// 评论：挂在周承诺 / B+验收标准 / 里程碑描述 / B / B+ 上。读和写对所有登录用户开放
// （"团队彼此看见"），删除在 service 层判定为"作者本人或 L1"。
@Controller('api/comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly rosterService: RosterService,
  ) {}

  @Get()
  @NeedLogin()
  async list(
    @Req() req: Request,
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ): Promise<ListCommentsResponse> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { items: await this.commentsService.list(targetType, targetId, actor) };
  }

  // 角标用的条数表：一次拿全本周，避免每个卡片各发一次请求。
  @Get('counts')
  @NeedLogin()
  async counts(@Query('week') week: string): Promise<CommentCountsResponse> {
    if (!week) throw new BadRequestException('missing_week');
    return { counts: await this.commentsService.countsForWeek(week) };
  }

  @Get('inbox')
  @NeedLogin()
  async inbox(@Req() req: Request): Promise<CommentInboxResponse> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { items: await this.commentsService.inbox(actor) };
  }

  @Get('locate/:id')
  @NeedLogin()
  async locate(@Req() req: Request, @Param('id') id: string): Promise<CommentDiscussion> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return this.commentsService.locate(id, actor);
  }

  @Post('read')
  @NeedLogin()
  async read(@Req() req: Request, @Body() dto: ReadCommentsRequest): Promise<{ ok: boolean }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    await this.commentsService.markRead(dto.commentIds, actor);
    return { ok: true };
  }

  @Post()
  @NeedLogin()
  async create(@Req() req: Request, @Body() dto: CreateCommentRequest) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const record = await this.commentsService.create(dto.targetType, dto.targetId, dto.body ?? '', actor);
    return { record };
  }

  @Delete(':id')
  @NeedLogin()
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: boolean }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { ok: await this.commentsService.remove(id, actor) };
  }
}
