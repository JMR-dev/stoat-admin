import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch, ApiError } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type {
  CreateInviteResponse,
  InviteListResponse,
  InviteRecord
} from "../lib/types";

const expiryOptions = [
  { label: "No expiry", value: "" },
  { label: "24 hours", value: "24" },
  { label: "48 hours", value: "48" },
  { label: "7 days", value: "168" },
  { label: "30 days", value: "720" }
];

const badgeStyles: Record<InviteRecord["status"], string> = {
  accepted: "border-emerald-200 bg-emerald-100 text-emerald-900",
  pending: "border-amber-200 bg-amber-100 text-amber-900",
  revoked: "border-red-200 bg-red-100 text-red-900",
  expired: "border-stone-200 bg-stone-100 text-stone-700"
};

export function InvitesView() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: () => apiFetch<InviteListResponse>("/api/invites")
  });
  const inviteList = invitesQuery.data?.invites ?? [];

  const createInviteMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateInviteResponse>("/api/invites", {
        method: "POST",
        body: JSON.stringify({
          email,
          ...(expiresInHours ? { expiresInHours: Number(expiresInHours) } : {})
        })
      }),
    onSuccess: (result) => {
      setEmail("");
      setExpiresInHours("");
      setError(null);
      setFeedback(
        result.warning
          ? `${result.warning}. Invite code: ${result.invite.code}`
          : `Invite created for ${result.invite.email}. Code: ${result.invite.code}`
      );
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Failed to create invite"
      );
    }
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ success: true }>(`/api/invites/${code}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    }
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            Invites
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Issue and track access
          </h2>
        </div>
        <p className="text-sm text-[color:var(--ink-muted)]">
          Pending invites stay valid in Stoat even if email delivery fails.
        </p>
      </header>

      <section className="grid gap-4 rounded-[28px] border border-[color:var(--line)] bg-white/70 p-6 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
        <label className="space-y-2">
          <span className="text-sm font-medium">Recipient email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
            type="email"
            placeholder="user@example.com"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Expiry</span>
          <select
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
          >
            {expiryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => createInviteMutation.mutate()}
          disabled={!email || createInviteMutation.isPending}
          className="self-end rounded-2xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createInviteMutation.isPending ? "Sending..." : "Send Invite"}
        </button>

        {feedback ? (
          <div className="lg:col-span-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <div className="lg:col-span-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-white/72">
        <div className="border-b border-[color:var(--line)] px-6 py-4">
          <h3 className="text-lg font-semibold">Invite history</h3>
        </div>

        {invitesQuery.isLoading ? (
          <div className="px-6 py-6 text-sm text-[color:var(--ink-muted)]">
            Loading invites...
          </div>
        ) : invitesQuery.isError ? (
          <div className="px-6 py-6 text-sm text-red-700">
            Failed to load invites.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-900/4 text-[color:var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Code</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium">Expires</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {inviteList.map((invite) => (
                  <tr
                    key={invite.code}
                    className="border-t border-[color:var(--line)]"
                  >
                    <td className="px-6 py-4">{invite.email}</td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {invite.code}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeStyles[invite.status]}`}
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {formatDateTime(invite.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      {formatDateTime(invite.expires_at)}
                    </td>
                    <td className="px-6 py-4">
                      {invite.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() =>
                            revokeInviteMutation.mutate(invite.code)
                          }
                          disabled={revokeInviteMutation.isPending}
                          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--ink-muted)]">
                          No action
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
