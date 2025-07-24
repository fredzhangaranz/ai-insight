import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ChartComponent } from "../chart-component";
import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  KpiData,
} from "@/lib/chart-contracts";

// Mock the child components
jest.mock("../bar-chart", () => ({
  BarChart: ({ title, data }: any) => (
    <div data-testid="bar-chart">
      {title}
      <span>Items: {data.length}</span>
    </div>
  ),
}));

jest.mock("../line-chart", () => ({
  LineChart: ({ title, data }: any) => (
    <div data-testid="line-chart">
      {title}
      <span>Points: {data.length}</span>
    </div>
  ),
}));

jest.mock("../pie-chart", () => ({
  PieChart: ({ title, data }: any) => (
    <div data-testid="pie-chart">
      {title}
      <span>Slices: {data.length}</span>
    </div>
  ),
}));

jest.mock("../kpi-card", () => ({
  KpiCard: ({ title, data }: any) => (
    <div data-testid="kpi-card">
      {title}
      <span>Value: {data.value}</span>
    </div>
  ),
}));

describe("ChartComponent", () => {
  const barData: BarChartDataPoint[] = [
    { category: "A", value: 10, id: "1" },
    { category: "B", value: 20, id: "2" },
  ];

  const lineData: LineChartDataPoint[] = [
    { x: "2024-01-01", y: 10, id: "1" },
    { x: "2024-01-02", y: 20, id: "2" },
  ];

  const pieData: PieChartDataPoint[] = [
    { label: "A", value: 40, id: "1" },
    { label: "B", value: 60, id: "2" },
  ];

  const kpiData: KpiData = {
    label: "Metric",
    value: 42,
    unit: "units",
  };

  it("renders bar chart correctly", () => {
    render(
      <ChartComponent
        chartType="bar"
        data={barData}
        title="Bar Chart"
        chartProps={{
          xAxisLabel: "Category",
          yAxisLabel: "Value",
        }}
      />
    );

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByText("Bar Chart")).toBeInTheDocument();
    expect(screen.getByText("Items: 2")).toBeInTheDocument();
  });

  it("renders line chart correctly", () => {
    render(
      <ChartComponent
        chartType="line"
        data={lineData}
        title="Line Chart"
        chartProps={{
          showDots: true,
          dateFormat: true,
        }}
      />
    );

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByText("Line Chart")).toBeInTheDocument();
    expect(screen.getByText("Points: 2")).toBeInTheDocument();
  });

  it("renders pie chart correctly", () => {
    render(
      <ChartComponent
        chartType="pie"
        data={pieData}
        title="Pie Chart"
        chartProps={{
          showLabels: true,
          showLegend: true,
        }}
      />
    );

    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    expect(screen.getByText("Pie Chart")).toBeInTheDocument();
    expect(screen.getByText("Slices: 2")).toBeInTheDocument();
  });

  it("renders KPI card correctly", () => {
    render(
      <ChartComponent
        chartType="kpi"
        data={kpiData}
        title="KPI Card"
        chartProps={{
          size: "lg",
        }}
      />
    );

    expect(screen.getByTestId("kpi-card")).toBeInTheDocument();
    expect(screen.getByText("KPI Card")).toBeInTheDocument();
    expect(screen.getByText("Value: 42")).toBeInTheDocument();
  });

  it("throws error for invalid data format", () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, "error");
    consoleSpy.mockImplementation(() => {});

    expect(() => {
      render(
        <ChartComponent
          chartType="bar"
          data={lineData as any}
          title="Invalid Data"
        />
      );
    }).toThrow("Invalid data format for bar chart");

    consoleSpy.mockRestore();
  });

  it("throws error for unsupported chart type", () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, "error");
    consoleSpy.mockImplementation(() => {});

    expect(() => {
      render(
        <ChartComponent
          chartType={"unknown" as any}
          data={barData}
          title="Invalid Type"
        />
      );
    }).toThrow("Unsupported chart type: unknown");

    consoleSpy.mockRestore();
  });

  it("throws error for table type", () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, "error");
    consoleSpy.mockImplementation(() => {});

    expect(() => {
      render(
        <ChartComponent chartType="table" data={barData} title="Table View" />
      );
    }).toThrow("Table view is not implemented in the chart component");

    consoleSpy.mockRestore();
  });
});
