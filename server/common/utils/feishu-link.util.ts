// 应用自己的链接一律用飞书 applink 包一层再发出去。
//
// 原因：在飞书里点一条普通 https 外链，客户端默认会把它交给系统浏览器打开——用户从
// 飞书跳到浏览器，登录态/上下文都断了，看一条评论还要重新走一遍。套上 applink 的
// web_url/open 之后，飞书会在应用内 webview 里打开，和从工作台点进应用是同一种体验。
//
// mode=appCenter 是妙搭应用（full_stack）对应的形态，别照搬网上的 mode=window 示例。
export const ANEVER_APP_URL = 'https://lwnmuwghgr.feishuapp.com/app/app_17b0qs50x8v';

export function feishuAppLink(target: string = ANEVER_APP_URL): string {
  return `https://applink.feishu.cn/client/web_url/open?mode=appCenter&url=${encodeURIComponent(target)}`;
}
