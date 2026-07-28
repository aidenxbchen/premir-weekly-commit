import { Router } from "express";
import { requireAuth } from "../lib/session.js";
import { currentWeekLabel } from "../lib/week.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, (req, res) => {
  res.json({ ...req.user, week: currentWeekLabel() });
});

