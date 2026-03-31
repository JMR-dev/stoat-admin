import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import { apiFetch, ApiError } from "./api";
import type { SessionUser } from "./types";

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void apiFetch<SessionUser>("/api/auth/me")
      .then((sessionUser) => {
        if (isMounted) {
          setUser(sessionUser);
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }

        setUser(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(username: string, password: string) {
        const nextUser = await apiFetch<SessionUser>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });

        setUser(nextUser);
      },
      async logout() {
        try {
          await apiFetch("/api/auth/logout", {
            method: "POST"
          });
        } finally {
          setUser(null);
        }
      }
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
