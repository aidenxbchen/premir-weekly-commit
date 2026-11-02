import type { ResolveDocTitlesRequest, ResolveDocTitlesResponse } from '@shared/api.interface';
import { apiRequest } from './http';

/** 批量解析飞书文档标题，键为 "<docx|wiki>:<token>"。 */
export async function resolveDocTitles(texts: string[]): Promise<ResolveDocTitlesResponse> {
  const dto: ResolveDocTitlesRequest = { texts };
  return apiRequest<ResolveDocTitlesResponse>('POST', '/api/doc-titles', dto);
}
