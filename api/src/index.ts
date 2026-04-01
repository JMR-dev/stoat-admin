import "dotenv/config";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import cron from "node-cron";

import "./db/sqlite.js";
import { connectMongo } from "./db/mongo.js";
import { syncInviteStatuses } from "./jobs/inviteSync.js";
import { env } from "./lib/env.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { requireAuth, sessionMiddleware } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { invitesRouter } from "./routes/invites.js";
import { usersRouter } from "./routes/users.js";

async function main(): Promise<void> {
  await connectMongo();

  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(
    cors({
      origin: env.ADMIN_WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/invites", requireAuth, invitesRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);

  app.use(notFound);
  app.use(errorHandler);

  await syncInviteStatuses();
  cron.schedule("*/5 * * * *", () => {
    void syncInviteStatuses().catch((error) => {
      console.error("Invite sync failed", error);
    });
  });

  app.listen(env.ADMIN_API_PORT, () => {
    console.log(`admin-api listening on :${env.ADMIN_API_PORT}`);
  });
}

void main().catch((error) => {
  console.error("Failed to start admin-api", error);
  process.exit(1);
});
