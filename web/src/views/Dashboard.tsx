import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { DashboardStats } from "../lib/types";

const statCards: Array<{
  key: keyof DashboardStats;
  label: string;
  note: string;
}> = [
  {
    key: "totalUsers",
    label: "Total Users",
    note: "Accounts currently indexed in Stoat."
  },
  {
    key: "bannedUsers",
    label: "Banned Users",
    note: "Users with the banned flag or disabled account state."
  },
  {
    key: "pendingInvites",
    label: "Pending Invites",
    note: "Invites issued but not yet consumed."
  },
  {
    key: "recentBans",
    label: "Recent Bans",
    note: "Audit entries created in the last 30 days."
  }
];

export function DashboardView() {
  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard/stats")
  });
  const stats = statsQuery.data;

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] bg-[color:var(--bg-panel-strong)] px-6 py-8 text-white">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-400">
          Overview
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight">
          Instance control room
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-stone-300">
          Fast access to invite state, moderation activity, and account volume
          without depending on the public Stoat UI.
        </p>
      </section>

      {statsQuery.isLoading ? (
        <div className="rounded-3xl border border-[color:var(--line)] bg-white/50 px-5 py-4">
          Loading dashboard stats...
        </div>
      ) : statsQuery.isError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
          Failed to load dashboard stats.
        </div>
      ) : stats ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <article
              key={card.key}
              className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-5 shadow-sm backdrop-blur"
            >
              <p className="text-xs uppercase tracking-[0.26em] text-[color:var(--ink-muted)]">
                {card.label}
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-tight">
                {stats[card.key]}
              </p>
              <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
                {card.note}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
