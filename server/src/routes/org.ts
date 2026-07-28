import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { searchDirectory } from "../lib/directory.js";
import { removeRosterEntry, upsertRosterEntry, type Role } from "../roster.js";
import { wrap } from "../lib/asyncHandler.js";

export const orgRouter = Router();

// Everything here is admin-only — this is the org chart, not team-facing
// data (that's /api/roster, open to everyone for display).
orgRouter.use(requireAuth, requireRole("admin"));

const VALID_ROLES: Role[] = ["admin", "lead", "member"];

interface FeishuSdkError {
  response?: { data?: { code?: number; msg?: string } };
}

// Search the whole Feishu org directory by name — for the "add a person"
// picker, so admin isn't limited to people already in the roster.
orgRouter.get(
  "/directory",
  wrap(async (req, res) => {
    const q = String(req.query.q ?? "");
    try {
      const items = await searchDirectory(q);
      res.json({ items });
    } catch (err) {
      const feishuCode = (err as FeishuSdkError).response?.data?.code;
      if (feishuCode === 40004) {
        return res.status(403).json({
          error:
            "应用还没有通讯录读取权限——请在飞书开发者后台为这个自建应用开通「以应用身份读取通讯录」权限（contact:contact:readonly_as_app），发布后才能搜索人员",
          feishuCode,
        });
      }
      throw err;
    }
  })
);

// Add someone to a module (or change their role/module if already
// present) — upserts by open_id, same shape as roster.json used to be.
orgRouter.post("/members", (req, res) => {
  const { openId, name, avatarUrl, module, role } = req.body ?? {};
  if (!openId || !name || !role) return res.status(400).json({ error: "missing_fields" });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "invalid_role" });
  upsertRosterEntry(openId, {
    name,
    role,
    module: module || undefined,
    avatarUrl: avatarUrl || undefined,
  });
  res.json({ ok: true });
});

// Removes someone from the roster entirely (not just from one module) —
// they stay findable again via the directory search if re-added later.
orgRouter.delete("/members/:openId", (req, res) => {
  removeRosterEntry(req.params.openId);
  res.json({ ok: true });
});
