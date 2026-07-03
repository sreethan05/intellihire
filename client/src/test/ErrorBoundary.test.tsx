import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/ErrorBoundary";

function ThrowError() {
  throw new Error("Test Error");
  return null;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches errors and renders fallback message", () => {
    // Suppress console.error log output during test run
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("renders custom fallback component when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Fallback")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
