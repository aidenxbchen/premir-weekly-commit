import { useUsersByIds } from '@/components/business-ui/api/users/queries';
import { getI18nText } from '@/components/business-ui/utils/user';

// 每人一次独立请求（react-query 按 userId 缓存/去重）——这是线上确认有效的
// 拉取方式。之前把一整页所有人一次性塞进一个批量请求，线上直接整批拿不到
// 数据（全员都掉回姓氏首字兜底），所以退回逐人请求，只是把渲染尺寸做大。
//
// `avatar` 字段这个批量接口不总是回纯字符串——有时是
// `{ image: { large: string } }` 这种嵌套结构（同 user-display 内部
// userInfoToUser 的处理一致）。当成字符串直接塞进 <img src> 会变成
// "[object Object]"，图裂了才回退成姓氏首字，这才是"一直没有头像"的真正原因。
function extractAvatarUrl(avatar: unknown): string | undefined {
  if (typeof avatar === 'string') return avatar;
  if (avatar && typeof avatar === 'object' && 'image' in avatar) {
    const large = (avatar as { image?: { large?: string } }).image?.large;
    if (large) return large;
  }
  return undefined;
}

export function usePersonInfo(userId?: string): { name: string; avatarUrl?: string } {
  const ids = userId ? [userId] : [];
  const { data } = useUsersByIds(ids);
  const info = userId ? data?.data?.userInfoMap?.[userId] : undefined;
  return { name: info ? getI18nText(info.name) : '', avatarUrl: extractAvatarUrl(info?.avatar) };
}
