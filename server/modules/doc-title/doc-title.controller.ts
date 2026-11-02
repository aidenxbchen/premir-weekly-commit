import { Body, Controller, Post } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { extractDocRefs, DocTitleService } from './doc-title.service';
import type { ResolveDocTitlesRequest, ResolveDocTitlesResponse } from '@shared/api.interface';

// 只接受文本、返回标题，不落库也不暴露 token——前端把渲染用的文本发过来即可。
@Controller('api/doc-titles')
export class DocTitleController {
  constructor(private readonly docTitleService: DocTitleService) {}

  @Post()
  @NeedLogin()
  async resolve(@Body() dto: ResolveDocTitlesRequest): Promise<ResolveDocTitlesResponse> {
    // 前端会把一整页要渲染的文本攒成一次请求（原来是一个字段一次请求），
    // 所以条数上限按"一页有多少个字段"放宽；单个文本仍然截断，避免超长正文。
    const texts = Array.isArray(dto.texts) ? dto.texts.slice(0, 300) : [];
    const refs = extractDocRefs(texts.map((text) => String(text).slice(0, 10_000)).join('\n'));
    return { titles: await this.docTitleService.resolve(refs) };
  }
}
