import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@/types";
import { authApi } from "@/lib/api";
import { AuthMeResponseSchema } from "@/lib/apiSchemas";

interface AuthContextType {
  user: User | null;
  login: (token: string | null | undefined, user: User) => void;
  logout: () => void;
  loading: boolean;
  updateUser: (updatedUser: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchMe() {
      try {
        const response = await authApi.getMe();
        const parsed = AuthMeResponseSchema.safeParse(response.data);
        if (active && parsed.success) {
          setUser((prev) => prev ?? parsed.data.user);
        } else if (active) {
          setUser((prev) => prev ?? null);
        }
      } catch {
        if (active) {
          setUser((prev) => prev ?? null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    fetchMe();
    return () => {
      active = false;
    };
  }, []);

  const login = (_token: string | null | undefined, user: User) => {
    setUser(user);
    setLoading(false);
  };

  const logout = () => {
    authApi.logout().finally(() => {
      setUser(null);
      window.location.href = "/login";
    });
  };

  const updateUser = (updatedUser: Partial<User>) => {
    setUser((prev) => prev ? { ...prev, ...updatedUser } : null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
