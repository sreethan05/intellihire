import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSection } from "../components/dashboard/DashboardKit";

describe("DashboardSection", () => {
  it("renders title, description and child components correctly", () => {
    render(
      <DashboardSection title="System Overview" description="View overall server system status">
        <div data-testid="section-content">Main dashboard stats</div>
      </DashboardSection>
    );

    expect(screen.getByText("System Overview")).toBeInTheDocument();
    expect(screen.getByText("View overall server system status")).toBeInTheDocument();
    expect(screen.getByTestId("section-content")).toBeInTheDocument();
  });
});
