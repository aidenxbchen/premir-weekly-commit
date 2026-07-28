import crypto from "node:crypto";
import { config } from "../config.js";

// The Feishu Node SDK doesn't wrap the jssdk ticket endpoint, so this talks
// to the raw Open Platform APIs directly with a small in-memory token/ticket
// cache (fine for a single-process deployment).

let tenantTokenCache: { token: string; expiresAt: number } | null = null;

async function getTenantAccessToken(): Promise<string> {
  if (tenantTokenCache && tenantTokenCache.expiresAt > Date.now() + 60_000) {
    return tenantTokenCache.token;
  }
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret }),
  });
  const data = (await res.json()) as { code: number; msg: string; tenant_access_token: string; expire: number };
  if (data.code !== 0) throw new Error(`tenant_access_token failed: ${data.msg}`);
  tenantTokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + data.expire * 1000 };
  return tenantTokenCache.token;
}

let ticketCache: { ticket: string; expiresAt: number } | null = null;

async function getJsApiTicket(): Promise<string> {
  if (ticketCache && ticketCache.expiresAt > Date.now() + 60_000) {
    return ticketCache.ticket;
  }
  const token = await getTenantAccessToken();
  const res = await fetch("https://open.feishu.cn/open-apis/jssdk/ticket/get", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = (await res.json()) as {
    code: number;
    msg: string;
    data: { ticket: string; expire_in: number };
  };
  if (data.code !== 0) throw new Error(`jsapi ticket failed: ${data.msg}`);
  ticketCache = { ticket: data.data.ticket, expiresAt: Date.now() + data.data.expire_in * 1000 };
  return ticketCache.ticket;
}

export async function buildJsApiSignature(url: string) {
  const ticket = await getJsApiTicket();
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash("sha1").update(raw).digest("hex");
  return { appId: config.feishu.appId, timestamp, nonceStr, signature };
}
