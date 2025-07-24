import React from "react";
import { BarChart } from "../bar-chart";
import type { BarChartDataPoint } from "@/lib/chart-contracts";

const sampleData: BarChartDataPoint[] = [
  { category: "Diabetic", value: 145, id: "1" },
  { category: "Pressure Ulcer", value: 98, id: "2" },
  { category: "Venous", value: 76, id: "3" },
  { category: "Arterial", value: 45, id: "4" },
];

export function BarChartExample() {
  return (
    <div className="p-6 space-y-8">
      {/* Vertical Bar Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Vertical Bar Chart</h2>
        <BarChart
          data={sampleData}
          title="Distribution of Wound Types"
          xAxisLabel="Wound Type"
          yAxisLabel="Number of Cases"
        />
      </div>

      {/* Horizontal Bar Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Horizontal Bar Chart</h2>
        <BarChart
          data={sampleData}
          title="Distribution of Wound Types"
          xAxisLabel="Number of Cases"
          yAxisLabel="Wound Type"
          horizontal={true}
        />
      </div>

      {/* Custom Colored Bar Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Custom Colored Bar Chart</h2>
        <BarChart
          data={sampleData}
          title="Distribution of Wound Types"
          xAxisLabel="Wound Type"
          yAxisLabel="Number of Cases"
          barColor="#10b981" // Emerald color
        />
      </div>
    </div>
  );
}
