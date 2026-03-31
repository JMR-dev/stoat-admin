import { Router } from "express";
import { customAlphabet } from "nanoid";
import { Resend } from "resend";
import { z } from "zod";

import { logAction } from "../db/audit.js";
import { invites } from "../db/mongo.js";
import { statements } from "../db/sqlite.js";
import type { InviteRecord } from "../db/types.js";
import { asyncHandler } from "../lib/async-handler.js";
import { env } from "../lib/env.js";

const inviteAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateCode = customAlphabet(inviteAlphabet, 12);
const resend = new Resend(env.RESEND_API_KEY);

const createInviteSchema = z.object({
  email: z.string().email(),
  expiresInHours: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 365)
    .optional()
});

function getInviteRecordOrThrow(code: string): InviteRecord {
  const record = statements.getInviteRecordByCode.get(code);
  if (!record) {
    throw new Error(`Invite record ${code} not found after insert`);
  }

  return record;
}

export const invitesRouter = Router();

invitesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const inviteRecords = statements.listInviteRecords.all();
    const count =
      statements.countInviteRecords.get()?.count ?? inviteRecords.length;

    res.status(200).json({ invites: inviteRecords, count });
  })
);

invitesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = createInviteSchema.parse(req.body);
    const code = generateCode();
    const expiresAt = payload.expiresInHours
      ? new Date(
          Date.now() + payload.expiresInHours * 60 * 60 * 1000
        ).toISOString()
      : null;

    await invites().insertOne({ _id: code });
    statements.insertInviteRecord.run(code, payload.email, expiresAt);

    let warning: string | undefined;

    try {
      const response = await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: payload.email,
        subject: `You've been invited to ${env.INSTANCE_NAME}`,
        text: `You've been invited to ${env.INSTANCE_NAME}.\n\nUse this invite link to register:\n${env.INSTANCE_URL}?invite=${code}`
      });

      const messageId = response.data?.id ?? null;
      statements.updateInviteResendMessage.run(messageId, code);
    } catch (error) {
      console.error("Invite email delivery failed", error);
      warning = "Invite created but email delivery failed";
    }

    logAction("invite_created", payload.email, {
      code,
      expires_at: expiresAt
    });

    const record = getInviteRecordOrThrow(code);
    res.status(201).json({
      invite: record,
      ...(warning ? { warning } : {})
    });
  })
);

invitesRouter.delete(
  "/:code",
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.params);
    const record = statements.getInviteRecordByCode.get(code);

    if (!record) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    if (record.status !== "pending") {
      res.status(400).json({ error: "Only pending invites can be revoked" });
      return;
    }

    await invites().deleteOne({ _id: code });
    statements.markInviteRevoked.run(code);
    logAction("invite_revoked", record.email, { code });

    res.status(200).json({ success: true });
  })
);
