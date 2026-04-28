export interface AccountDocument {
  _id: string;
  email: string;
  email_normalised?: string;
  disabled: boolean;
  spam?: boolean;
  verification?: {
    status: "Verified" | "Pending" | "Moving";
  };
  deletion?: {
    status: "Scheduled" | "WaitingForVerification" | "Deleted";
    after?: string;
  };
  lockout?: {
    attempts: number;
    expiry: string;
  };
}

export interface UserDocument {
  _id: string;
  username: string;
  discriminator: string;
  flags?: number;
  avatar?: unknown;
}

export interface SessionDocument {
  _id: string;
  user_id: string;
}

export interface InviteDocument {
  _id: string;
}

export interface StrikeDocument {
  _id: string;
  user_id: string;
  reason: string;
  type?: "strike" | "suspension" | "ban";
  case_id?: string;
}

export type InviteRecordStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InviteRecord {
  id: number;
  code: string;
  email: string;
  status: InviteRecordStatus;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  resend_message_id: string | null;
}

export interface AuditLogRecord {
  id: number;
  action: string;
  target: string;
  details: string | null;
  created_at: string;
}

export interface AdminUserRecord {
  id: number;
  username: string;
  password_hash: string;
}
