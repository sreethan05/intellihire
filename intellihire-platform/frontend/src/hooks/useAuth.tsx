import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AuthUser, Role } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  isTPO: boolean;
  isRecruiter: boolean;
  isCandidate: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/me").then((res) => setUser(res.data)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const session = await api.post("/auth/login", { email, password });
    localStorage.setItem("intellihire_token", session.data.session.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    localStorage.removeItem("intellihire_token");
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
    hasRole: (...roles) => !!user && roles.includes(user.role),
    isAdmin: user?.role === "admin",
    isTPO: user?.role === "tpo",
    isRecruiter: user?.role === "recruiter",
    isCandidate: user?.role === "candidate"
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

