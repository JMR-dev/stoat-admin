import { Router } from "express";

import { users } from "../db/mongo.js";
import { statements } from "../db/sqlite.js";
import { asyncHandler } from "../lib/async-handler.js";
import { USER_FLAG_BANNED } from "../lib/flags.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [totalUsers, bannedUserAggregate] = await Promise.all([
      users().countDocuments({}),
      users()
        .aggregate([
          { $match: { flags: { $bitsAllSet: USER_FLAG_BANNED } } },
          { $count: "count" }
        ])
        .toArray()
    ]);

    const pendingInvites = statements.countPendingInvites.get()?.count ?? 0;
    const recentBans = statements.countRecentBans.get()?.count ?? 0;
    const bannedUsers = bannedUserAggregate[0]?.count ?? 0;

    res.status(200).json({
      totalUsers,
      bannedUsers,
      pendingInvites,
      recentBans
    });
  })
);
