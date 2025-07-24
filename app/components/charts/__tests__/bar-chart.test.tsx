import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BarChart } from "../bar-chart";
import type { BarChartDataPoint } from "@/lib/chart-contracts";

// Mock the ResponsiveContainer since it doesn't work well in tests
jest.mock("recharts", () => {
  const OriginalModule = jest.requireActual("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

// Mock data following the BarChartDataPoint contract
const sampleData: BarChartDataPoint[] = [
  { category: "Diabetic", value: 145, id: "1" },
  { category: "Pressure Ulcer", value: 98, id: "2" },
  { category: "Venous", value: 76, id: "3" },
  { category: "Arterial", value: 45, id: "4" },
];

describe("BarChart", () => {
  it("renders with title when provided", () => {
    render(
      <BarChart
        data={sampleData}
        title="Wound Types Distribution"
        xAxisLabel="Wound Type"
        yAxisLabel="Count"
      />
    );

    expect(screen.getByText("Wound Types Distribution")).toBeInTheDocument();
  });

  it("renders without title when not provided", () => {
    const { container } = render(
      <BarChart data={sampleData} xAxisLabel="Wound Type" yAxisLabel="Count" />
    );

    const titles = container.getElementsByTagName("h3");
    expect(titles.length).toBe(0);
  });

  it("renders in horizontal layout when specified", () => {
    render(
      <BarChart
        data={sampleData}
        horizontal={true}
        xAxisLabel="Count"
        yAxisLabel="Wound Type"
      />
    );

    // Note: More specific layout tests would require integration testing with recharts
  });

  it("handles empty data gracefully", () => {
    render(
      <BarChart
        data={[]}
        title="Empty Chart"
        xAxisLabel="Category"
        yAxisLabel="Value"
      />
    );

    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
  });
});
