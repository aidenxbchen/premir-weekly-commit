import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { runNightlyBackup } from "../lib/nightlyBackup.js";
import { wrap } from "../lib/asyncHandler.js";

export const backupRouter = Router();

// Admin-only manual trigger, mainly for verifying the backup actually
// works without waiting for the 2am schedule — the real backup runs on
// its own via startNightlyBackupSchedule() in index.ts.
backupRouter.use(requireAuth, requireRole("admin"));

backupRouter.post(
  "/run-now",
  wrap(async (_req, res) => {
    await runNightlyBackup();
    res.json({ ok: true });
  })
);
