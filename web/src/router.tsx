import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { DashboardView } from "./views/Dashboard";
import { InvitesView } from "./views/Invites";
import { LoginView } from "./views/Login";
import { UserDetailView } from "./views/UserDetail";
import { UsersView } from "./views/Users";

function ProtectedLayout() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--bg-panel)] px-6 py-5 shadow-[var(--shadow)]">
          Loading admin session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginView />
  },
  {
    path: "/",
    element: <ProtectedLayout />,
    children: [
      {
        index: true,
        element: <DashboardView />
      },
      {
        path: "invites",
        element: <InvitesView />
      },
      {
        path: "users",
        element: <UsersView />
      },
      {
        path: "users/:id",
        element: <UserDetailView />
      }
    ]
  }
]);
