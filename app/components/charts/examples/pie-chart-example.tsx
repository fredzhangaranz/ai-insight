import React from "react";
import { PieChart } from "../pie-chart";
import type { PieChartDataPoint } from "@/lib/chart-contracts";

// Sample data for wound type distribution
const woundTypeData: PieChartDataPoint[] = [
  { label: "Diabetic", value: 145, id: "1" },
  { label: "Pressure Ulcer", value: 98, id: "2" },
  { label: "Venous", value: 76, id: "3" },
  { label: "Arterial", value: 45, id: "4" },
  { label: "Surgical", value: 34, id: "5" },
  { label: "Other", value: 22, id: "6" },
];

// Sample data with custom colors
const treatmentData: PieChartDataPoint[] = [
  {
    label: "Standard Dressing",
    value: 180,
    id: "1",
    color: "#2563eb", // Blue
  },
  {
    label: "Advanced Therapy",
    value: 120,
    id: "2",
    color: "#10b981", // Emerald
  },
  {
    label: "Compression",
    value: 90,
    id: "3",
    color: "#f59e0b", // Amber
  },
];

export function PieChartExample() {
  return (
    <div className="p-6 space-y-8">
      {/* Basic Pie Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Standard Pie Chart</h2>
        <PieChart
          data={woundTypeData}
          title="Distribution of Wound Types"
          showLabels={true}
          showLegend={true}
        />
      </div>

      {/* Donut Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Donut Chart</h2>
        <PieChart
          data={woundTypeData}
          title="Distribution of Wound Types"
          showLabels={true}
          showLegend={true}
          innerRadius={0.6}
        />
      </div>

      {/* Custom Colors Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Custom Colored Chart</h2>
        <PieChart
          data={treatmentData}
          title="Treatment Methods Distribution"
          showLabels={true}
          showLegend={true}
        />
      </div>

      {/* Minimal Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Minimal Chart (No Labels or Legend)
        </h2>
        <PieChart
          data={treatmentData}
          title="Treatment Methods Distribution"
          showLabels={false}
          showLegend={false}
        />
      </div>
    </div>
  );
}
