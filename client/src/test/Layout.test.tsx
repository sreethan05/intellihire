import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "../components/layout/Layout";

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

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Stub global.fetch
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ hasKey: true, credits: 100 }),
}));

describe("Layout", () => {
  it("renders layout sidebar navigation elements", () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    // Assert that the user's name is rendered in the layout
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
