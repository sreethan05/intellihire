import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "../components/OfflineBanner";

describe("OfflineBanner Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when online and not recently restored", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders offline banner when window offline event is dispatched", () => {
    render(<OfflineBanner />);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      screen.getByText(/Offline Mode: Working disconnected/i)
    ).toBeInTheDocument();
  });

  it("triggers onSyncDrafts callback and displays connection restored message when online event fires", () => {
    const syncMock = vi.fn();
    render(<OfflineBanner onSyncDrafts={syncMock} />);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Connection Restored: All local response drafts synced successfully!/i)
    ).toBeInTheDocument();
  });
});
