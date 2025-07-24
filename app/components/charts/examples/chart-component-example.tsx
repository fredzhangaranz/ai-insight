import React from "react";
import { ChartComponent } from "../chart-component";
import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  KpiData,
} from "@/lib/chart-contracts";

// Sample data for each chart type
const barData: BarChartDataPoint[] = [
  { category: "Diabetic", value: 145, id: "1" },
  { category: "Pressure Ulcer", value: 98, id: "2" },
  { category: "Venous", value: 76, id: "3" },
  { category: "Arterial", value: 45, id: "4" },
];

const lineData: LineChartDataPoint[] = [
  { x: "2024-01-01", y: 45.5, id: "1", label: "Initial Assessment" },
  { x: "2024-01-15", y: 42.3, id: "2" },
  { x: "2024-02-01", y: 38.7, id: "3" },
  { x: "2024-02-15", y: 35.2, id: "4" },
  { x: "2024-03-01", y: 30.1, id: "5" },
];

const pieData: PieChartDataPoint[] = [
  { label: "Standard Dressing", value: 180, id: "1" },
  { label: "Advanced Therapy", value: 120, id: "2" },
  { label: "Compression", value: 90, id: "3" },
];

const kpiData: KpiData = {
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

export function ChartComponentExample() {
  return (
    <div className="p-6 space-y-8">
      <h2 className="text-2xl font-semibold mb-6">Chart Component Examples</h2>

      {/* Bar Chart Example */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Bar Chart</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vertical Bar Chart */}
          <ChartComponent
            chartType="bar"
            data={barData}
            title="Wound Types Distribution"
            chartProps={{
              xAxisLabel: "Wound Type",
              yAxisLabel: "Number of Cases",
              barColor: "#2563eb",
            }}
          />

          {/* Horizontal Bar Chart */}
          <ChartComponent
            chartType="bar"
            data={barData}
            title="Wound Types Distribution (Horizontal)"
            chartProps={{
              xAxisLabel: "Number of Cases",
              yAxisLabel: "Wound Type",
              horizontal: true,
              barColor: "#10b981",
            }}
          />
        </div>
      </div>

      {/* Line Chart Example */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Line Chart</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Line Chart */}
          <ChartComponent
            chartType="line"
            data={lineData}
            title="Wound Area Over Time"
            chartProps={{
              xAxisLabel: "Date",
              yAxisLabel: "Area (cm²)",
              showDots: true,
              dateFormat: true,
            }}
          />

          {/* Area Chart */}
          <ChartComponent
            chartType="line"
            data={lineData}
            title="Wound Area Over Time (with Area)"
            chartProps={{
              xAxisLabel: "Date",
              yAxisLabel: "Area (cm²)",
              showDots: true,
              showArea: true,
              dateFormat: true,
              lineColor: "#10b981",
            }}
          />
        </div>
      </div>

      {/* Pie Chart Example */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Pie Chart</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Standard Pie Chart */}
          <ChartComponent
            chartType="pie"
            data={pieData}
            title="Treatment Methods Distribution"
            chartProps={{
              showLabels: true,
              showLegend: true,
            }}
          />

          {/* Donut Chart */}
          <ChartComponent
            chartType="pie"
            data={pieData}
            title="Treatment Methods Distribution (Donut)"
            chartProps={{
              showLabels: true,
              showLegend: true,
              innerRadius: 0.6,
              colors: ["#2563eb", "#10b981", "#f59e0b"],
            }}
          />
        </div>
      </div>

      {/* KPI Cards Example */}
      <div>
        <h3 className="text-xl font-semibold mb-4">KPI Cards</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Small KPI */}
          <ChartComponent
            chartType="kpi"
            data={kpiData}
            title="Compact View"
            chartProps={{ size: "sm" }}
          />

          {/* Medium KPI */}
          <ChartComponent
            chartType="kpi"
            data={kpiData}
            title="Standard View"
            chartProps={{ size: "md" }}
          />

          {/* Large KPI */}
          <ChartComponent
            chartType="kpi"
            data={kpiData}
            title="Featured View"
            chartProps={{ size: "lg" }}
          />
        </div>
      </div>
    </div>
  );
}
