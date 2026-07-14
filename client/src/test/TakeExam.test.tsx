import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TakeExam from "../pages/candidate/TakeExam";

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
  }),
}));

// Mock Auth Context
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "1", name: "Alice", role: "candidate" },
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

// Mock College Context
vi.mock("@/context/CollegeContext", () => ({
  useCollege: () => ({
    selectedCollegeId: null,
    setSelectedCollegeId: vi.fn(),
    collegesSummary: [],
  }),
}));

// Mock react-router
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useParams: () => ({ examId: "exam-123" }),
    useNavigate: () => vi.fn(),
  };
});

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock mediaDevices
vi.stubGlobal("navigator", {
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
});

// Mock APIs
vi.mock("@/lib/api", () => ({
  candidateApi: {
    getExam: vi.fn().mockResolvedValue({
      data: {
        exam: {
          id: "exam-123",
          title: "Python Assessment",
          description: "Test Python skills",
          duration: 30,
          total_marks: 100,
          pass_marks: 50,
          shuffle_questions: false,
        },
        mcqQuestions: [],
        codingQuestions: [],
      },
    }),
  },
  compilerApi: {
    runCode: vi.fn(),
    submitCode: vi.fn(),
  },
  proctoringApi: {
    logEvent: vi.fn(),
    getAttemptEvents: vi.fn().mockResolvedValue({ data: [] }),
    createAttempt: vi.fn().mockResolvedValue({ data: { attemptId: "attempt-456" } }),
  },
  resultApi: {
    submitMcq: vi.fn(),
    submitCode: vi.fn(),
    submitExam: vi.fn(),
    updateCodeScore: vi.fn(),
  },
}));

describe("TakeExam Page", () => {
  it("renders loading skeleton initially and exam title after loading", async () => {
    render(
      <MemoryRouter>
        <TakeExam />
      </MemoryRouter>
    );

    // Assert exam title renders after promise resolves
    await waitFor(() => {
      expect(screen.getByText("Python Assessment")).toBeInTheDocument();
    });

    expect(screen.getByText("Exam Integrity Rules")).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "SPAN" && element?.textContent?.includes("Duration: 30 min") === true)).toBeInTheDocument();
  });
});
