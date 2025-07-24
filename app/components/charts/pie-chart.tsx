import React, { useMemo } from "react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PieChartDataPoint } from "@/lib/chart-contracts";

interface PieChartProps {
  data: PieChartDataPoint[];
  title?: string;
  showLabels?: boolean;
  showLegend?: boolean;
  colors?: string[];
  innerRadius?: number; // For donut chart, 0-1 as percentage of radius
  className?: string;
}

// Default color palette - you can override with props
const defaultColors = [
  "#2563eb", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#84cc16", // Lime
];

/**
 * A "dumb" pie chart component that renders data according to the PieChartDataPoint contract.
 * Uses recharts library for the actual visualization.
 * Particularly useful for showing part-to-whole relationships.
 */
export function PieChart({
  data,
  title,
  showLabels = true,
  showLegend = true,
  colors = defaultColors,
  innerRadius = 0, // 0 for pie, >0 for donut
  className = "",
}: PieChartProps) {
  // Calculate percentages and ensure data follows the contract
  const chartData = useMemo(() => {
    const total = data.reduce((sum, point) => sum + point.value, 0);
    return data.map((point, index) => ({
      ...point,
      id: point.id || `slice-${index}`,
      percentage: ((point.value / total) * 100).toFixed(1),
      color: point.color || colors[index % colors.length],
    }));
  }, [data, colors]);

  // Custom label for pie slices
  const renderLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    label,
  }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? ( // Only show label if slice is > 5%
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  // Custom tooltip content
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 border border-slate-200 rounded-md shadow-sm">
          <p className="font-medium">{data.label}</p>
          <p className="text-sm text-slate-600">
            Value: {data.value.toLocaleString()}
          </p>
          <p className="text-sm text-slate-600">
            Percentage: {data.percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full h-[400px] ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={`${innerRadius * 100}%`}
            outerRadius="90%"
            label={showLabels ? renderLabel : false}
            labelLine={false}
          >
            {chartData.map((entry) => (
              <Cell key={entry.id} fill={entry.color} />
            ))}
          </Pie>
          {showLegend && (
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              formatter={(value: string, entry: any) => (
                <span className="text-sm">
                  {value} ({entry.payload.percentage}%)
                </span>
              )}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
