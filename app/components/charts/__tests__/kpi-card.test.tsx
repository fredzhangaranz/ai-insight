import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { KpiCard } from "../kpi-card";
import type { KpiData } from "@/lib/chart-contracts";

// Sample KPI data with all optional fields
const fullKpiData: KpiData = {
  label: "Average Healing Time",
  value: 45.5,
  unit: "days",
  trend: {
    direction: "down",
    value: 12.3,
  },
  comparison: {
    label: "Previous Month",
    value: 57.8,
  },
};

// Minimal KPI data
const minimalKpiData: KpiData = {
  label: "Total Patients",
  value: 1234,
};

describe("KpiCard", () => {
  it("renders with all data fields", () => {
    render(<KpiCard data={fullKpiData} title="Healing Metrics" />);

    expect(screen.getByText("Healing Metrics")).toBeInTheDocument();
    expect(screen.getByText("Average Healing Time")).toBeInTheDocument();
    expect(screen.getByText("45.5")).toBeInTheDocument();
    expect(screen.getByText("days")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("12.3"))
    ).toBeInTheDocument();
    expect(screen.getByText(/Previous Month/)).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("57.8"))
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Decreasing")).toBeInTheDocument();
  });

  it("renders with minimal data", () => {
    render(<KpiCard data={minimalKpiData} title="Patient Count" />);

    expect(screen.getByText("Patient Count")).toBeInTheDocument();
    expect(screen.getByText("Total Patients")).toBeInTheDocument();
    expect(screen.getByText("1.2K")).toBeInTheDocument();
  });

  it("formats large numbers correctly", () => {
    const largeNumberData: KpiData = {
      label: "Total Revenue",
      value: 1234567,
      unit: "$",
    };

    render(<KpiCard data={largeNumberData} />);
    expect(screen.getByText("1.2M")).toBeInTheDocument();
  });

  it("renders in different sizes", () => {
    const { rerender } = render(<KpiCard data={minimalKpiData} size="sm" />);

    let container =
      screen.getByText("Total Patients").parentElement?.parentElement;
    expect(container).toHaveClass("p-4");

    rerender(<KpiCard data={minimalKpiData} size="lg" />);

    container = screen.getByText("Total Patients").parentElement?.parentElement;
    expect(container).toHaveClass("p-8");
  });

  it("renders trend indicators correctly", () => {
    const upTrendData: KpiData = {
      ...minimalKpiData,
      trend: {
        direction: "up",
        value: 5.2,
      },
    };

    const { rerender } = render(<KpiCard data={upTrendData} />);
    expect(screen.getByLabelText("Increasing")).toBeInTheDocument();

    const neutralTrendData: KpiData = {
      ...minimalKpiData,
      trend: {
        direction: "neutral",
        value: 0,
      },
    };

    rerender(<KpiCard data={neutralTrendData} />);
    expect(screen.getByLabelText("No change")).toBeInTheDocument();
  });
});
