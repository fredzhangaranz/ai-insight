import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LineChart } from "../line-chart";
import type { LineChartDataPoint } from "@/lib/chart-contracts";
import { vi } from "vitest";

// Mock the ResponsiveContainer since it doesn't work well in tests
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  const stub = (testId: string) =>
    function Stub({ children }: { children?: React.ReactNode }) {
      return <div data-testid={testId}>{children}</div>;
    };

  return {
    ...actual,
    ResponsiveContainer: stub("recharts-responsive-container"),
    LineChart: stub("recharts-line-chart"),
    Line: stub("recharts-line"),
    XAxis: stub("recharts-x-axis"),
    YAxis: stub("recharts-y-axis"),
    CartesianGrid: stub("recharts-cartesian-grid"),
    Tooltip: stub("recharts-tooltip"),
    Legend: stub("recharts-legend"),
    Area: stub("recharts-area"),
  };
});

// Mock data following the LineChartDataPoint contract
const sampleDateData: LineChartDataPoint[] = [
  { x: "2024-01-01", y: 45.5, id: "1" },
  { x: "2024-01-15", y: 42.3, id: "2" },
  { x: "2024-02-01", y: 38.7, id: "3" },
  { x: "2024-02-15", y: 35.2, id: "4" },
];

const sampleNumericData: LineChartDataPoint[] = [
  { x: 1, y: 45.5, id: "1" },
  { x: 2, y: 42.3, id: "2" },
  { x: 3, y: 38.7, id: "3" },
  { x: 4, y: 35.2, id: "4" },
];

describe("LineChart", () => {
  it("renders with title when provided", () => {
    render(
      <LineChart
        data={sampleDateData}
        title="Wound Area Over Time"
        xAxisLabel="Date"
        yAxisLabel="Area (cm²)"
        dateFormat={true}
      />
    );

    expect(screen.getByText("Wound Area Over Time")).toBeInTheDocument();
  });

  it("renders without title when not provided", () => {
    const { container } = render(
      <LineChart
        data={sampleDateData}
        xAxisLabel="Date"
        yAxisLabel="Area (cm²)"
        dateFormat={true}
      />
    );

    const titles = container.getElementsByTagName("h3");
    expect(titles.length).toBe(0);
  });

  it("renders with numeric x-axis data", () => {
    render(
      <LineChart
        data={sampleNumericData}
        title="Measurements"
        xAxisLabel="Week"
        yAxisLabel="Value"
      />
    );

    expect(screen.getByText("Measurements")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(
      <LineChart
        data={[]}
        title="Empty Chart"
        xAxisLabel="Date"
        yAxisLabel="Value"
      />
    );

    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
  });

  it("renders with area fill when showArea is true", () => {
    render(
      <LineChart
        data={sampleNumericData}
        title="Area Chart"
        xAxisLabel="Week"
        yAxisLabel="Value"
        showArea={true}
      />
    );

    expect(screen.getByText("Area Chart")).toBeInTheDocument();
  });
});
