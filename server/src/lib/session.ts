import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import type { Role } from "../roster.js";

export interface SessionUser {
  openId: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  module?: string;
}

export const SESSION_COOKIE = "premir_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function issueSession(res: Response, user: SessionUser) {
  const token = jwt.sign(user, config.sessionSecret, { expiresIn: "12h" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "not_logged_in" });
  try {
    req.user = jwt.verify(token, config.sessionSecret) as SessionUser;
    next();
  } catch {
    res.status(401).json({ error: "session_expired" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
