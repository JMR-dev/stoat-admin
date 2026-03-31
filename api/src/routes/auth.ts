import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";

import { statements } from "../db/sqlite.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, SESSION_COOKIE_NAME } from "../middleware/auth.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    const user = statements.getAdminUserByUsername.get(credentials.username);

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const isValid = await argon2.verify(
      user.password_hash,
      credentials.password
    );

    if (!isValid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.status(200).json({ username: user.username });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(200).json({ success: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json({ username: req.session.username });
  })
);
