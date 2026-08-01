import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Login from "../pages/Login";
import { authApi } from "@/lib/api";

// Mock react-router
const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuth
const mockLogin = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

// Mock authApi
vi.mock("@/lib/api", () => ({
  authApi: {
    login: vi.fn(),
  },
}));

describe("Login Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders tab headers and switches content correctly", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Default tab should be Admin
    expect(screen.getByRole("heading", { name: "Admin Login" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter admin username")).toBeInTheDocument();

    // Click Student tab
    fireEvent.click(screen.getByRole("button", { name: "Student" }));
    expect(screen.getByRole("heading", { name: "Student Login" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter student email")).toBeInTheDocument();
  });

  it("submits the form and updates authentication state", async () => {
    const mockUser = { id: "1", name: "Bob", role: "candidate", profile_complete: true };
    vi.mocked(authApi.login).mockResolvedValueOnce({
      data: { token: "fake-token", user: mockUser },
    } as any);

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Switch to student tab
    fireEvent.click(screen.getByRole("button", { name: "Student" }));

    // Fill inputs
    fireEvent.change(screen.getByPlaceholderText("Enter student email"), {
      target: { value: "bob@college.edu" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter password"), {
      target: { value: "secret123" },
    });

    // Submit form
    fireEvent.submit(screen.getByRole("button", { name: "Sign In" }));

    // Verify it called API
    expect(authApi.login).toHaveBeenCalledWith("bob@college.edu", "secret123");

    // Wait for async auth processing
    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("fake-token", mockUser);
    });
  });
});
