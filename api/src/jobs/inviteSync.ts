import { invites } from "../db/mongo.js";
import { statements } from "../db/sqlite.js";

export async function syncInviteStatuses(): Promise<void> {
  const pendingInvites = statements.selectPendingInvites.all();

  for (const record of pendingInvites) {
    const inviteExists = await invites().findOne({ _id: record.code });

    if (!inviteExists) {
      statements.markInviteAccepted.run(record.code);
      continue;
    }

    if (
      record.expires_at &&
      new Date(record.expires_at).getTime() < Date.now()
    ) {
      statements.markInviteExpired.run(record.code);
      await invites().deleteOne({ _id: record.code });
    }
  }
}
