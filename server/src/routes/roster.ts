import { Router } from "express";
import { requireAuth } from "../lib/session.js";
import { getAvatars } from "../lib/store.js";
import { listRoster } from "../roster.js";

export const rosterRouter = Router();

// Team names/modules aren't sensitive — any logged-in team member can see
// who's who. Used to render "who hasn't been rated yet" style views.
// Prefers each roster entry's own avatarUrl (set directly from the Feishu
// directory when they were added via 组织架构管理) — falls back to the
// derived one from lib/sync.ts (scraped from wherever they've shown up in
// Bitable data) for people added before that existed.
rosterRouter.get("/", requireAuth, (_req, res) => {
  const avatars = getAvatars();
  const items = listRoster().map((item) => ({ ...item, avatarUrl: item.avatarUrl ?? avatars[item.openId] }));
  res.json({ items });
});
