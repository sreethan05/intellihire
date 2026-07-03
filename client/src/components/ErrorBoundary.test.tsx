import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const ThrowError = () => {
  throw new Error("Test error");
  return null;
};

describe("ErrorBoundary", () => {
  it("renders fallback when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reload Application")).toBeInTheDocument();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Normal content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
