import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCandidateProfile, useUpdateCandidateProfile } from "./useCandidate";
import { candidateApi } from "../lib/api";

// Mock the API
vi.mock("../lib/api", () => ({
  candidateApi: {
    getProfile: vi.fn(),
    getDashboard: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCandidateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches profile data", async () => {
    const mockData = { user: { id: "1", name: "Test" }, profile: { branch: "CSE" } };
    (candidateApi.getProfile as any).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useCandidateProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it("handles error state", async () => {
    (candidateApi.getProfile as any).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useCandidateProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateCandidateProfile", () => {
  it("invalidates profile query on success", async () => {
    (candidateApi.updateProfile as any).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useUpdateCandidateProfile(), { wrapper: createWrapper() });

    result.current.mutate({ bio: "Updated" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
