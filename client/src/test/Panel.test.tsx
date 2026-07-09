import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "../components/dashboard/DashboardKit";

describe("Panel", () => {
  it("renders title and children correctly", () => {
    render(
      <Panel title="Placement Funnel">
        <div data-testid="panel-child">Funnel Chart Content</div>
      </Panel>
    );

    expect(screen.getByText("Placement Funnel")).toBeInTheDocument();
    expect(screen.getByTestId("panel-child")).toHaveTextContent("Funnel Chart Content");
  });

  it("renders action node if provided", () => {
    render(
      <Panel title="Recent Activity" action={<button data-testid="panel-action">View All</button>}>
        <div>Activity list</div>
      </Panel>
    );

    expect(screen.getByTestId("panel-action")).toBeInTheDocument();
  });
});
