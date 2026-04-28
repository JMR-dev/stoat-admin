import session from "express-session";
import connectSqlite3 from "better-sqlite3-session-store";
import type { RequestHandler } from "express";

import { env } from "../lib/env.js";
import { sqlite } from "../db/sqlite.js";

const SQLiteStore = connectSqlite3(session);
export const SESSION_COOKIE_NAME = "stoat-admin.sid";
const SESSION_COOKIE_SECURE =
  new URL(env.ADMIN_WEB_ORIGIN).protocol === "https:";
export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "strict",
  secure: SESSION_COOKIE_SECURE
} as const;

export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    client: sqlite,
    expired: {
      clear: true,
      intervalMs: 15 * 60 * 1000
    }
  }),
  cookie: {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 2 * 60 * 60 * 1000
  }
});

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  next();
};
