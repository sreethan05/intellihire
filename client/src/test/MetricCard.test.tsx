import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "../components/dashboard/DashboardKit";
import { Users } from "lucide-react";

describe("MetricCard", () => {
  it("renders metric title, value and icon correctly", () => {
    render(
      <MetricCard
        title="Total Candidates"
        value={150}
        icon={Users}
        tone="blue"
      />
    );

    expect(screen.getByText("Total Candidates")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("renders trend text when provided", () => {
    render(
      <MetricCard
        title="Active Jobs"
        value="12"
        icon={Users}
        tone="green"
        trend="+3 this week"
      />
    );

    expect(screen.getByText("+3 this week")).toBeInTheDocument();
  });
});
