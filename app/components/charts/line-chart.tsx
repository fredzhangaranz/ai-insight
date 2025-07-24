import React from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { LineChartDataPoint } from "@/lib/chart-contracts";

export interface LineChartProps {
  data: LineChartDataPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  lineColor?: string;
  showDots?: boolean;
  showArea?: boolean;
  dateFormat?: boolean; // If true, formats x-axis as dates
  className?: string; // Added className prop
}

/**
 * A "dumb" line chart component that renders data according to the LineChartDataPoint contract.
 * Uses recharts library for the actual visualization.
 * Particularly useful for time series data like wound measurements over time.
 */
export function LineChart({
  data,
  title,
  xAxisLabel,
  yAxisLabel,
  lineColor = "#2563eb", // Default to a nice blue color
  showDots = true,
  showArea = false,
  dateFormat = false,
  className = "", // Default to empty string
}: LineChartProps) {
  // Ensure data follows the contract and handle date formatting
  const chartData = data.map((point) => ({
    ...point,
    id: point.id || point.x, // Fallback to x value if no id provided
    // If x is a date string and dateFormat is true, convert to Date object
    x: dateFormat && typeof point.x === "string" ? new Date(point.x) : point.x,
  }));

  // Sort data by x value if they're dates or numbers
  const sortedData = [...chartData].sort((a, b) => {
    const aVal = a.x instanceof Date ? a.x.getTime() : Number(a.x);
    const bVal = b.x instanceof Date ? b.x.getTime() : Number(b.x);
    return aVal - bVal;
  });

  // Format date for tooltip and axis if needed
  const formatXValue = (value: string | number | Date): string => {
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  };

  return (
    <div className={`w-full h-[400px] ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart
          data={sortedData}
          margin={{
            top: 20,
            right: 30,
            left: 40,
            bottom: 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tickFormatter={formatXValue}
            label={{
              value: xAxisLabel,
              position: "bottom",
              offset: 20,
            }}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            label={{
              value: yAxisLabel,
              angle: -90,
              position: "left",
              offset: -20,
            }}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={formatXValue}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke={lineColor}
            strokeWidth={2}
            dot={showDots ? { r: 4, strokeWidth: 2 } : false}
            activeDot={{ r: 6, strokeWidth: 2 }}
            name={yAxisLabel || "Value"}
            connectNulls
            fill={showArea ? lineColor : undefined}
            fillOpacity={showArea ? 0.1 : 0}
          />
          <Legend />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
