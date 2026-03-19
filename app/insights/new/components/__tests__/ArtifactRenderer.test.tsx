import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ArtifactRenderer } from "../ArtifactRenderer";

vi.mock("@/app/components/charts/chart-component", () => ({
  ChartComponent: ({ chartType }: { chartType: string }) => (
    <div data-testid="chart-component">Chart: {chartType}</div>
  ),
}));

describe("ArtifactRenderer", () => {
  it("falls back to a table with a notice when the chart mapping is invalid", () => {
    render(
      <ArtifactRenderer
        artifact={{
          kind: "chart",
          chartType: "bar",
          title: "Broken chart",
          mapping: { x: "assessmentDate", y: "woundArea" },
          primary: true,
        }}
        rows={[
          { assessmentDate: "2026-01-01", woundArea: 12.5 },
          { assessmentDate: "2026-01-08", woundArea: 10.2 },
        ]}
        columns={["assessmentDate", "woundArea"]}
      />
    );

    expect(
      screen.getByText("Chart unavailable for this result shape. Showing a table instead.")
    ).toBeInTheDocument();
    expect(screen.getByText("assessmentDate")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-component")).not.toBeInTheDocument();
  });
});
