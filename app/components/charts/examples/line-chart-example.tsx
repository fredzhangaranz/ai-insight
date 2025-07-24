import React from "react";
import { LineChart } from "../line-chart";
import type { LineChartDataPoint } from "@/lib/chart-contracts";

// Sample data for wound area measurements over time
const woundAreaData: LineChartDataPoint[] = [
  { x: "2024-01-01", y: 45.5, id: "1", label: "Initial Assessment" },
  { x: "2024-01-15", y: 42.3, id: "2" },
  { x: "2024-02-01", y: 38.7, id: "3" },
  { x: "2024-02-15", y: 35.2, id: "4" },
  { x: "2024-03-01", y: 30.1, id: "5" },
  { x: "2024-03-15", y: 25.8, id: "6" },
  { x: "2024-04-01", y: 20.4, id: "7" },
  { x: "2024-04-15", y: 15.2, id: "8", label: "Final Assessment" },
];

// Sample data for weekly pain scores
const painScoreData: LineChartDataPoint[] = [
  { x: 1, y: 8, id: "1" },
  { x: 2, y: 7, id: "2" },
  { x: 3, y: 6, id: "3" },
  { x: 4, y: 5, id: "4" },
  { x: 5, y: 4, id: "5" },
  { x: 6, y: 3, id: "6" },
  { x: 7, y: 2, id: "7" },
  { x: 8, y: 1, id: "8" },
];

export function LineChartExample() {
  return (
    <div className="p-6 space-y-8">
      {/* Time Series Example with Dates */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Wound Area Over Time</h2>
        <LineChart
          data={woundAreaData}
          title="Wound Healing Progress"
          xAxisLabel="Assessment Date"
          yAxisLabel="Wound Area (cm²)"
          dateFormat={true}
          showDots={true}
        />
      </div>

      {/* Area Chart Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Area Chart</h2>
        <LineChart
          data={woundAreaData}
          title="Wound Healing Progress with Area"
          xAxisLabel="Assessment Date"
          yAxisLabel="Wound Area (cm²)"
          dateFormat={true}
          showArea={true}
          lineColor="#10b981" // Emerald color
        />
      </div>

      {/* Numeric X-Axis Example */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Pain Score Trend</h2>
        <LineChart
          data={painScoreData}
          title="Weekly Pain Score"
          xAxisLabel="Week"
          yAxisLabel="Pain Score (0-10)"
          lineColor="#ef4444" // Red color
          showDots={true}
        />
      </div>
    </div>
  );
}
