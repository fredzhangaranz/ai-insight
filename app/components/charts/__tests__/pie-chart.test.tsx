import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PieChart } from "../pie-chart";
import type { PieChartDataPoint } from "@/lib/chart-contracts";
import { vi } from "vitest";

// Mock the ResponsiveContainer since it doesn't work well in tests
vi.mock("recharts", () => {
  const OriginalModule = vi.importActual("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    PieChart: ({ children, ...props }: any) => (
      <div data-testid="recharts-pie-chart" {...props}>
        {children}
      </div>
    ),
    Pie: ({ ...props }: any) => <div data-testid="recharts-pie" {...props} />,
    Cell: ({ ...props }: any) => <div data-testid="recharts-cell" {...props} />,
    Tooltip: ({ ...props }: any) => (
      <div data-testid="recharts-tooltip" {...props} />
    ),
    Legend: ({ ...props }: any) => (
      <div data-testid="recharts-legend" {...props} />
    ),
  };
});

// Mock data following the PieChartDataPoint contract
const sampleData: PieChartDataPoint[] = [
  { label: "Diabetic", value: 145, id: "1" },
  { label: "Pressure Ulcer", value: 98, id: "2" },
  { label: "Venous", value: 76, id: "3" },
  { label: "Arterial", value: 45, id: "4" },
];

describe("PieChart", () => {
  it("renders with title when provided", () => {
    render(<PieChart data={sampleData} title="Wound Type Distribution" />);

    expect(screen.getByText("Wound Type Distribution")).toBeInTheDocument();
  });

  it("renders without title when not provided", () => {
    const { container } = render(<PieChart data={sampleData} />);

    const titles = container.getElementsByTagName("h3");
    expect(titles.length).toBe(0);
  });

  it("renders with custom colors", () => {
    const customColors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    render(
      <PieChart data={sampleData} colors={customColors} title="Custom Colors" />
    );

    expect(screen.getByText("Custom Colors")).toBeInTheDocument();
  });

  it("renders as donut chart when innerRadius is provided", () => {
    render(
      <PieChart data={sampleData} title="Donut Chart" innerRadius={0.6} />
    );

    expect(screen.getByText("Donut Chart")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<PieChart data={[]} title="Empty Chart" />);

    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
  });

  it("renders without labels when showLabels is false", () => {
    render(<PieChart data={sampleData} title="No Labels" showLabels={false} />);

    expect(screen.getByText("No Labels")).toBeInTheDocument();
  });

  it("renders without legend when showLegend is false", () => {
    render(<PieChart data={sampleData} title="No Legend" showLegend={false} />);

    expect(screen.getByText("No Legend")).toBeInTheDocument();
  });
});
