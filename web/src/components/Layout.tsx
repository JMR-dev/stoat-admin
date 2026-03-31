import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/invites", label: "Invites" },
  { to: "/users", label: "Users" }
];

export function Layout() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-[color:var(--line)] bg-[color:var(--bg-panel-strong)] p-6 text-stone-100 shadow-[var(--shadow)]">
          <div className="mb-10 space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-400">
              Stoat Admin
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Operations
            </h1>
            <p className="text-sm text-stone-300">
              Invite, moderate, and review account state on your instance.
            </p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-white/6 text-stone-200 hover:bg-white/10"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Signed in
            </p>
            <p className="mt-2 text-lg font-medium text-white">
              {user?.username}
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
            >
              Log out
            </button>
          </div>
        </aside>

        <main className="rounded-[28px] border border-[color:var(--line)] bg-[color:var(--bg-panel)] p-5 shadow-[var(--shadow)] sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
