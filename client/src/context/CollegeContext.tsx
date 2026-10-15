import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface CollegeSummary {
  id: string;
  name: string;
  code: string;
  location: string;
  drivesCount: number;
  candidatesCount: number;
  registeredCount: number;
  attemptsCount: number;
  completedAttemptsCount: number;
  passCount: number;
  offersCount: number;
  aiInterviewsCount: number;
  averageScore: number;
}

interface CollegeContextType {
  selectedCollegeId: string | null;
  setSelectedCollegeId: (id: string | null) => void;
  collegesSummary: CollegeSummary[];
  loading: boolean;
  refreshColleges: () => Promise<void>;
}

const CollegeContext = createContext<CollegeContextType | null>(null);

export function CollegeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedCollegeId, setSelectedCollegeIdState] = useState<string | null>(() => {
    return localStorage.getItem("selected_college_id");
  });
  const [collegesSummary, setCollegesSummary] = useState<CollegeSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const setSelectedCollegeId = (id: string | null) => {
    if (id) {
      localStorage.setItem("selected_college_id", id);
    } else {
      localStorage.removeItem("selected_college_id");
    }
    setSelectedCollegeIdState(id);
  };

  const refreshColleges = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/recruiter/colleges-summary");
      setCollegesSummary(response.data.colleges || []);
    } catch (error) {
      console.error("Failed to fetch colleges summary", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // AuthState is memory-only, so gate on the authenticated user from context
    // (restored via /auth/me) instead of the never-written localStorage key.
    if (user?.role === "recruiter") {
      void refreshColleges();
    }
  }, [refreshColleges, user?.role]);

  return (
    <CollegeContext.Provider
      value={{
        selectedCollegeId,
        setSelectedCollegeId,
        collegesSummary,
        loading,
        refreshColleges,
      }}
    >
      {children}
    </CollegeContext.Provider>
  );
}

export function useCollege() {
  const context = useContext(CollegeContext);
  if (!context) throw new Error("useCollege must be used within CollegeProvider");
  return context;
}
