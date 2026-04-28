import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { getUserStatus } from "../lib/status";
import type { UsersResponse } from "../lib/types";

function buildUsersPath(page: number, search: string): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: "25"
  });

  if (search) {
    params.set("search", search);
  }

  return `/api/users?${params.toString()}`;
}

export function UsersView() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  const usersQuery = useQuery({
    queryKey: ["users", page, deferredSearch],
    queryFn: () => apiFetch<UsersResponse>(buildUsersPath(page, deferredSearch))
  });
  const userData = usersQuery.data;

  const totalPages = userData
    ? Math.max(1, Math.ceil(userData.total / userData.limit))
    : 1;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            Users
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Moderation view
          </h2>
        </div>
        <label className="w-full max-w-md space-y-2">
          <span className="text-sm font-medium">Search by email</span>
          <input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
            placeholder="name@example.com"
          />
        </label>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-white/72">
        {usersQuery.isLoading ? (
          <div className="px-6 py-6 text-sm text-[color:var(--ink-muted)]">
            Loading users...
          </div>
        ) : usersQuery.isError ? (
          <div className="px-6 py-6 text-sm text-red-700">
            Failed to load users.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-900/4 text-[color:var(--ink-muted)]">
                  <tr>
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {userData?.users.map((user) => {
                    const status = getUserStatus(
                      user.flags,
                      user.account?.disabled
                    );

                    return (
                      <tr
                        key={user._id}
                        className="cursor-pointer border-t border-[color:var(--line)] transition hover:bg-black/[0.03]"
                        onClick={() => navigate(`/users/${user._id}`)}
                      >
                        <td className="px-6 py-4 font-medium">
                          {user.username}#{user.discriminator}
                        </td>
                        <td className="px-6 py-4">
                          {user.account?.email ?? "Unknown"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {user.account?.verification?.status === "Verified"
                            ? "Yes"
                            : "No"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-[color:var(--line)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[color:var(--ink-muted)]">
                Page {userData?.page ?? 1} of {totalPages} ·{" "}
                {userData?.total ?? 0} results
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setPage((currentPage) => Math.max(1, currentPage - 1))
                  }
                  disabled={page <= 1}
                  className="rounded-xl border border-[color:var(--line)] px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((currentPage) =>
                      Math.min(totalPages, currentPage + 1)
                    )
                  }
                  disabled={page >= totalPages}
                  className="rounded-xl border border-[color:var(--line)] px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
