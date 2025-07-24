import React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BarChartDataPoint } from "@/lib/chart-contracts";

export interface BarChartProps {
  data: BarChartDataPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  barColor?: string;
  horizontal?: boolean;
  className?: string; // Added className prop
}

/**
 * A "dumb" bar chart component that renders data according to the BarChartDataPoint contract.
 * Uses recharts library for the actual visualization.
 */
export function BarChart({
  data,
  title,
  xAxisLabel,
  yAxisLabel,
  barColor = "#2563eb", // Default to a nice blue color
  horizontal = false,
  className = "", // Default to empty string
}: BarChartProps) {
  // Ensure data follows the contract
  const chartData = data.map((point) => ({
    ...point,
    id: point.id || point.category, // Fallback to category if no id provided
  }));

  return (
    <div className={`w-full h-[400px] ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={chartData}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{
            top: 20,
            right: 30,
            left: 40,
            bottom: 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          {horizontal ? (
            <>
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="category"
                width={150}
                tick={{ fontSize: 12 }}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="category"
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
                label={{
                  value: xAxisLabel,
                  position: "bottom",
                  offset: 30,
                }}
              />
              <YAxis
                label={{
                  value: yAxisLabel,
                  angle: -90,
                  position: "left",
                  offset: 0,
                }}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
          <Bar
            dataKey="value"
            fill={barColor}
            radius={[4, 4, 0, 0]} // Slightly rounded tops
            label={horizontal ? { position: "right" } : { position: "top" }}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
