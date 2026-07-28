import { Router } from "express";
import { client, withUserAccessToken } from "../feishu.js";
import { lookupUser, listRoster } from "../roster.js";
import { issueSession, SESSION_COOKIE } from "../lib/session.js";
import { wrap } from "../lib/asyncHandler.js";
import { getAvatars } from "../lib/store.js";

export const authRouter = Router();

const DEV_LOGIN_ENABLED = process.env.NODE_ENV !== "production";

// Local-dev only: log in as any roster member without going through Feishu
// at all. Silent login (tt.requestAuthCode) only works inside the Feishu
// client webview on a domain registered to the app, which localhost isn't —
// this is how you exercise the rest of the app without deploying first.
// Disabled whenever NODE_ENV=production; never wire this into the real
// deployment's env config.
if (DEV_LOGIN_ENABLED) {
  authRouter.get("/dev-roster", (_req, res) => {
    res.json({ items: listRoster() });
  });

  authRouter.post("/dev-login", (req, res) => {
    const openId = req.body?.openId;
    const entry = openId ? lookupUser(openId) : undefined;
    if (!entry) return res.status(400).json({ error: "unknown_open_id" });
    // Dev login doesn't go through Feishu, so there's no avatar_url from the
    // OIDC userinfo call — backfill it from the local store, same as the
    // roster list, so local testing looks like the real thing.
    issueSession(res, {
      openId,
      name: entry.name,
      avatarUrl: getAvatars()[openId],
      role: entry.role,
      module: entry.module,
    });
    res.json({ ok: true, name: entry.name, role: entry.role, module: entry.module });
  });
}

// Silent-login exchange: the frontend gets a short-lived `code` from the
// Feishu JS-SDK (tt.requestAuthCode) while running inside the Feishu client,
// which is enough to identify the user without a separate login screen.
authRouter.post("/login", wrap(async (req, res) => {
  const code = req.body?.code;
  if (!code) return res.status(400).json({ error: "missing_code" });

  const tokenRes = await client.authen.oidcAccessToken.create({
    data: { grant_type: "authorization_code", code },
  });
  const accessToken = tokenRes.data?.access_token;
  if (!accessToken) {
    return res.status(401).json({ error: "feishu_auth_failed", detail: tokenRes.msg });
  }

  const infoRes = await client.authen.userInfo.get({}, withUserAccessToken(accessToken));
  const openId = infoRes.data?.open_id;
  if (!openId) return res.status(401).json({ error: "no_open_id" });

  const entry = lookupUser(openId);
  if (!entry) {
    return res.status(403).json({ error: "not_in_roster", name: infoRes.data?.name ?? "" });
  }

  issueSession(res, {
    openId,
    name: entry.name,
    avatarUrl: infoRes.data?.avatar_url,
    role: entry.role,
    module: entry.module,
  });
  res.json({ ok: true, name: entry.name, role: entry.role, module: entry.module });
}));

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});
