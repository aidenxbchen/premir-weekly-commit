import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { advanceWeek } from "../lib/week.js";

export const weekRouter = Router();

// Opens the next work week — admin-only (陈曦斌/刘庆雨, or any future admin).
// The confirmation prompt this needs lives entirely in the frontend, on
// every press; this endpoint just does the one thing it's asked.
weekRouter.post("/advance", requireAuth, requireRole("admin"), (_req, res) => {
  const week = advanceWeek();
  res.json({ week });
});
