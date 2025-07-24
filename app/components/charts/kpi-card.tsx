import React from "react";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from "@heroicons/react/24/solid";
import type { KpiData } from "@/lib/chart-contracts";

export interface KpiCardProps {
  data: KpiData;
  title?: string;
  size?: "sm" | "md" | "lg";
  className?: string; // Added className prop
}

/**
 * A "dumb" KPI card component that renders data according to the KpiData contract.
 * Displays a single value with optional trend and comparison information.
 */
export function KpiCard({
  data,
  title,
  size = "md",
  className = "", // Default to empty string
}: KpiCardProps) {
  // Helper function to format numbers nicely
  const formatValue = (value: string | number): string => {
    if (typeof value === "number") {
      // Handle large numbers with K/M/B suffixes
      if (value >= 1000000000) {
        return (value / 1000000000).toFixed(1) + "B";
      }
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + "M";
      }
      if (value >= 1000) {
        return (value / 1000).toFixed(1) + "K";
      }
      // For decimal numbers, limit to 2 decimal places
      return value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
    }
    return value;
  };

  // Helper function to get trend icon and color
  const getTrendIndicator = () => {
    if (!data.trend) return null;

    const iconClasses = "h-4 w-4 inline-block";
    switch (data.trend.direction) {
      case "up":
        return (
          <ArrowUpIcon
            className={`${iconClasses} text-emerald-500`}
            aria-label="Increasing"
          />
        );
      case "down":
        return (
          <ArrowDownIcon
            className={`${iconClasses} text-red-500`}
            aria-label="Decreasing"
          />
        );
      default:
        return (
          <MinusIcon
            className={`${iconClasses} text-gray-500`}
            aria-label="No change"
          />
        );
    }
  };

  // Size-based classes
  const sizeClasses = {
    sm: {
      card: "p-4",
      title: "text-sm",
      value: "text-2xl",
      label: "text-sm",
    },
    md: {
      card: "p-6",
      title: "text-base",
      value: "text-4xl",
      label: "text-base",
    },
    lg: {
      card: "p-8",
      title: "text-lg",
      value: "text-5xl",
      label: "text-lg",
    },
  }[size];

  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 shadow-sm ${sizeClasses.card} ${className}`}
    >
      {/* Optional title */}
      {title && (
        <h3 className={`text-slate-600 font-medium mb-2 ${sizeClasses.title}`}>
          {title}
        </h3>
      )}

      {/* Main value display */}
      <div className="space-y-2">
        <div className={`font-bold text-slate-900 ${sizeClasses.value}`}>
          {formatValue(data.value)}
          {data.unit && (
            <span className="text-slate-500 ml-1 text-base">{data.unit}</span>
          )}
        </div>
        <div className={`text-slate-600 ${sizeClasses.label}`}>
          {data.label}
        </div>
      </div>

      {/* Trend indicator */}
      {data.trend && (
        <div className="mt-4 flex items-center gap-1 text-sm">
          {getTrendIndicator()}
          <span
            className={
              data.trend.direction === "up"
                ? "text-emerald-600"
                : data.trend.direction === "down"
                ? "text-red-600"
                : "text-gray-600"
            }
          >
            {formatValue(data.trend.value)}
            {data.unit}
          </span>
        </div>
      )}

      {/* Comparison */}
      {data.comparison && (
        <div className="mt-2 text-sm text-slate-500">
          {data.comparison.label}:{" "}
          <span className="font-medium">
            {formatValue(data.comparison.value)}
            {data.unit}
          </span>
        </div>
      )}
    </div>
  );
}
