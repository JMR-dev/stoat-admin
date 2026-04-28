export interface SessionUser {
  username: string;
}

export interface DashboardStats {
  totalUsers: number;
  bannedUsers: number;
  pendingInvites: number;
  recentBans: number;
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

export interface InviteListResponse {
  invites: InviteRecord[];
  count: number;
}

export interface CreateInviteResponse {
  invite: InviteRecord;
  warning?: string;
}

export interface AccountRecord {
  _id: string;
  email: string;
  disabled: boolean;
  verification?: {
    status: "Verified" | "Pending" | "Moving";
  };
  deletion?: {
    status: "Scheduled" | "WaitingForVerification" | "Deleted";
    after?: string;
  };
}

export interface UserRecord {
  _id: string;
  username: string;
  discriminator: string;
  flags?: number;
  avatar?: unknown;
  account?: AccountRecord;
}

export interface StrikeRecord {
  _id: string;
  user_id: string;
  reason: string;
  type?: "strike" | "suspension" | "ban";
}

export interface UsersResponse {
  users: UserRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface UserDetailResponse {
  user: UserRecord | null;
  account: AccountRecord | null;
  strikes: StrikeRecord[];
}
