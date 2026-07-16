import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import type { User } from "@/types";

// Mock authApi
vi.mock("@/lib/api", () => {
  return {
    authApi: {
      getMe: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
  };
});

// Mock window.location
const locationMock = { href: "" };
vi.stubGlobal("location", locationMock);

function TestComponent() {
  const { user, login, logout, loading, updateUser } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {user ? (
        <div>
          <span data-testid="username">{user.name}</span>
          <span data-testid="role">{user.role}</span>
        </div>
      ) : (
        <span data-testid="logout-status">Logged out</span>
      )}
      <button
        onClick={() =>
          login("mock-token", {
            id: "1",
            name: "Test User",
            email: "test@example.com",
            role: "candidate",
          } as User)
        }
      >
        Login
      </button>
      <button onClick={() => updateUser({ name: "Updated Name" })}>Update Name</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    locationMock.href = "";
    vi.clearAllMocks();
  });

  it("manages login, update, and logout state updates", async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for the async /me query loading sequence to complete
    await screen.findByTestId("logout-status");
    expect(screen.getByTestId("logout-status")).toHaveTextContent("Logged out");

    // Click Login
    fireEvent.click(screen.getByText("Login"));
    expect(screen.getByTestId("username")).toHaveTextContent("Test User");
    expect(screen.getByTestId("role")).toHaveTextContent("candidate");

    // Click Update Name
    fireEvent.click(screen.getByText("Update Name"));
    expect(screen.getByTestId("username")).toHaveTextContent("Updated Name");

    // Click Logout
    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => {
      expect(screen.queryByTestId("username")).not.toBeInTheDocument();
    });
    expect(locationMock.href).toBe("/login");
  });
});
