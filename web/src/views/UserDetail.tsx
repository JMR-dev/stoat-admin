import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decodeTime } from "ulid";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { getFlagLabels, getUserStatus } from "../lib/status";
import type { UserDetailResponse } from "../lib/types";

function strikeDate(ulidValue: string): string {
  try {
    return formatDateTime(new Date(decodeTime(ulidValue)).toISOString());
  } catch {
    return ulidValue;
  }
}

export function UserDetailView() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [banReason, setBanReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const userQuery = useQuery({
    queryKey: ["user", id],
    enabled: Boolean(id),
    queryFn: () => apiFetch<UserDetailResponse>(`/api/users/${id}`)
  });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user", id] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    ]);
  };

  const banMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: true }>(`/api/users/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason: banReason })
      }),
    onSuccess: async () => {
      setBanReason("");
      await refresh();
    }
  });

  const unbanMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: true }>(`/api/users/${id}/unban`, {
        method: "POST"
      }),
    onSuccess: refresh
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: true }>(`/api/users/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: deleteReason || undefined })
      }),
    onSuccess: async () => {
      setDeleteReason("");
      await refresh();
    }
  });

  if (!id) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
        Missing user id.
      </div>
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className="rounded-3xl border border-[color:var(--line)] bg-white/60 px-5 py-4">
        Loading user…
      </div>
    );
  }

  const detail = userQuery.data;

  if (userQuery.isError || !detail?.user) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
        Failed to load user.
      </div>
    );
  }

  const { user, account, strikes } = detail;
  const status = getUserStatus(user.flags, account?.disabled);
  const scheduledDeletion = account?.deletion?.status === "Scheduled";

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-[color:var(--bg-panel-strong)] px-6 py-7 text-white">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-400">
          User Detail
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">
          {user.username}#{user.discriminator}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status.tone}`}
          >
            {status.label}
          </span>
          {getFlagLabels(user.flags).map((label) => (
            <span
              key={label}
              className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className="rounded-[28px] border border-[color:var(--line)] bg-white/72 p-6">
          <h3 className="text-lg font-semibold">Account info</h3>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
                Email
              </dt>
              <dd className="mt-2 text-base font-medium">
                {account?.email ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
                Verification
              </dt>
              <dd className="mt-2 text-base font-medium">
                {account?.verification?.status ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
                User ID
              </dt>
              <dd className="mt-2 font-mono text-sm">{user._id}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
                Deletion state
              </dt>
              <dd className="mt-2 text-base font-medium">
                {account?.deletion?.status ?? "Not scheduled"}
                {account?.deletion?.after
                  ? ` · ${formatDateTime(account.deletion.after)}`
                  : ""}
              </dd>
            </div>
          </dl>
        </article>

        <article className="rounded-[28px] border border-[color:var(--line)] bg-white/72 p-6">
          <h3 className="text-lg font-semibold">Actions</h3>

          {scheduledDeletion ? (
            <p className="mt-4 text-sm text-[color:var(--ink-muted)]">
              Deletion is already scheduled. Stoat&apos;s `crond` daemon will
              handle the remaining cleanup.
            </p>
          ) : status.label === "banned" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[color:var(--ink-muted)]">
                The user is currently banned. You can clear the disabled state
                and banned flag.
              </p>
              <button
                type="button"
                onClick={() => unbanMutation.mutate()}
                disabled={unbanMutation.isPending}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
              >
                {unbanMutation.isPending ? "Unbanning..." : "Unban user"}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              <div className="space-y-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <h4 className="font-semibold text-amber-950">Ban user</h4>
                <textarea
                  value={banReason}
                  onChange={(event) => setBanReason(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  placeholder="Required reason"
                />
                <button
                  type="button"
                  onClick={() => banMutation.mutate()}
                  disabled={!banReason.trim() || banMutation.isPending}
                  className="rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {banMutation.isPending ? "Applying ban..." : "Ban user"}
                </button>
              </div>

              <div className="space-y-3 rounded-3xl border border-red-200 bg-red-50 p-4">
                <h4 className="font-semibold text-red-950">
                  Schedule deletion
                </h4>
                <textarea
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-red-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  placeholder="Optional reason"
                />
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="rounded-2xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteMutation.isPending
                    ? "Scheduling..."
                    : "Schedule deletion"}
                </button>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-white/72">
        <div className="border-b border-[color:var(--line)] px-6 py-4">
          <h3 className="text-lg font-semibold">Strike history</h3>
        </div>
        {strikes.length === 0 ? (
          <div className="px-6 py-6 text-sm text-[color:var(--ink-muted)]">
            No strike records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-900/4 text-[color:var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">Reason</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {strikes.map(
                  (strike: UserDetailResponse["strikes"][number]) => (
                    <tr
                      key={strike._id}
                      className="border-t border-[color:var(--line)]"
                    >
                      <td className="px-6 py-4">{strike.reason}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                          {strike.type ?? "strike"}
                        </span>
                      </td>
                      <td className="px-6 py-4">{strikeDate(strike._id)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
