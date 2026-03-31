import { Router } from "express";
import { ulid } from "ulid";
import { z } from "zod";

import { logAction } from "../db/audit.js";
import { accounts, safetyStrikes, sessions, users } from "../db/mongo.js";
import { asyncHandler } from "../lib/async-handler.js";
import { USER_FLAG_BANNED, USER_FLAG_DELETED } from "../lib/flags.js";

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional()
});

const userIdParamsSchema = z.object({
  id: z.string().min(1)
});

const banSchema = z.object({
  reason: z.string().trim().min(1)
});

const deleteSchema = z.object({
  reason: z.string().trim().optional()
});

export const usersRouter = Router();

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, search } = listUsersSchema.parse(req.query);

    const basePipeline = [
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "account",
          pipeline: [
            {
              $project: {
                email: 1,
                disabled: 1,
                verification: 1,
                deletion: 1
              }
            }
          ]
        }
      },
      {
        $unwind: {
          path: "$account",
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    const searchStage = search
      ? [
          {
            $match: {
              "account.email": {
                $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                $options: "i"
              }
            }
          }
        ]
      : [];

    const recordsPipeline = [
      ...basePipeline,
      ...searchStage,
      { $sort: { username: 1, discriminator: 1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          username: 1,
          discriminator: 1,
          flags: 1,
          avatar: 1,
          account: 1
        }
      }
    ];

    const totalPipeline = [
      ...basePipeline,
      ...searchStage,
      { $count: "total" }
    ];

    const [userRecords, totalResult] = await Promise.all([
      users().aggregate(recordsPipeline).toArray(),
      users().aggregate(totalPipeline).toArray()
    ]);

    res.status(200).json({
      users: userRecords,
      total: totalResult[0]?.total ?? 0,
      page,
      limit
    });
  })
);

usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = userIdParamsSchema.parse(req.params);

    const [user, account, strikes] = await Promise.all([
      users().findOne({ _id: id }),
      accounts().findOne({ _id: id }),
      safetyStrikes().find({ user_id: id }).sort({ _id: -1 }).toArray()
    ]);

    if (!user && !account) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ user, account, strikes });
  })
);

usersRouter.post(
  "/:id/ban",
  asyncHandler(async (req, res) => {
    const { id } = userIdParamsSchema.parse(req.params);
    const { reason } = banSchema.parse(req.body);

    const [user, account] = await Promise.all([
      users().findOne({ _id: id }),
      accounts().findOne({ _id: id })
    ]);

    if (!user || !account) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (account.disabled) {
      res.status(400).json({ error: "User is already banned" });
      return;
    }

    await Promise.all([
      accounts().updateOne({ _id: id }, { $set: { disabled: true } }),
      users().updateOne(
        { _id: id },
        { $set: { flags: (user.flags ?? 0) | USER_FLAG_BANNED } }
      ),
      sessions().deleteMany({ user_id: id }),
      safetyStrikes().insertOne({
        _id: ulid(),
        user_id: id,
        reason,
        type: "ban"
      })
    ]);

    logAction("user_banned", id, { reason });
    res.status(200).json({ success: true });
  })
);

usersRouter.post(
  "/:id/unban",
  asyncHandler(async (req, res) => {
    const { id } = userIdParamsSchema.parse(req.params);

    const [user, account] = await Promise.all([
      users().findOne({ _id: id }),
      accounts().findOne({ _id: id })
    ]);

    if (!account || !user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!account.disabled) {
      res.status(400).json({ error: "User is not banned" });
      return;
    }

    await Promise.all([
      accounts().updateOne({ _id: id }, { $set: { disabled: false } }),
      users().updateOne(
        { _id: id },
        { $set: { flags: (user.flags ?? 0) & ~USER_FLAG_BANNED } }
      )
    ]);

    logAction("user_unbanned", id);
    res.status(200).json({ success: true });
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = userIdParamsSchema.parse(req.params);
    const { reason } = deleteSchema.parse(req.body ?? {});
    const user = await users().findOne({ _id: id });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await Promise.all([
      accounts().updateOne(
        { _id: id },
        {
          $set: {
            deletion: {
              status: "Scheduled",
              after: new Date().toISOString()
            }
          }
        }
      ),
      users().updateOne(
        { _id: id },
        { $set: { flags: (user.flags ?? 0) | USER_FLAG_DELETED } }
      ),
      sessions().deleteMany({ user_id: id })
    ]);

    logAction("user_deleted", id, reason ? { reason } : undefined);
    res.status(200).json({ success: true });
  })
);
