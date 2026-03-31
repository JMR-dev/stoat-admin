import session from "express-session";
import connectSqlite3 from "better-sqlite3-session-store";
import type { RequestHandler } from "express";

import { env } from "../lib/env.js";
import { sqlite } from "../db/sqlite.js";

const SQLiteStore = connectSqlite3(session);
export const SESSION_COOKIE_NAME = "stoat-admin.sid";

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
    maxAge: 2 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "strict",
    secure: false
  }
});

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  next();
};
