import React from "react";
import type {
  ChartType,
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  KpiData,
  TableData,
} from "@/lib/chart-contracts";
import { BarChart } from "./bar-chart";
import { LineChart } from "./line-chart";
import { PieChart } from "./pie-chart";
import { KpiCard } from "./kpi-card";
import { DataTable } from "../data-table";

// Define and export the ChartDataType
export type ChartDataType =
  | BarChartDataPoint[]
  | LineChartDataPoint[]
  | PieChartDataPoint[]
  | KpiData
  | TableData["rows"];

export interface ChartComponentProps {
  chartType: ChartType;
  data: ChartDataType;
  title?: string;
  className?: string;
}

function isBarChartData(data: any): data is BarChartDataPoint[] {
  const isValid =
    Array.isArray(data) &&
    data.length > 0 &&
    "category" in data[0] &&
    "value" in data[0];
  console.log("isBarChartData:", { data, isValid });
  return isValid;
}

function isLineChartData(data: any): data is LineChartDataPoint[] {
  const isValid =
    Array.isArray(data) && data.length > 0 && "x" in data[0] && "y" in data[0];
  console.log("isLineChartData:", { data, isValid });
  return isValid;
}

function isPieChartData(data: any): data is PieChartDataPoint[] {
  const isValid =
    Array.isArray(data) &&
    data.length > 0 &&
    "label" in data[0] &&
    "value" in data[0];
  console.log("isPieChartData:", { data, isValid });
  return isValid;
}

function isKpiData(data: any): data is KpiData {
  const isValid = !Array.isArray(data) && "label" in data && "value" in data;
  console.log("isKpiData:", { data, isValid });
  return isValid;
}

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      console.error("Chart Error:", error);
    }
  }, [error]);

  if (hasError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg">
        <h3 className="font-semibold">Chart Rendering Error</h3>
        <p className="text-sm">
          {error?.message || "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export function ChartComponent({
  chartType,
  data,
  title,
  className = "",
}: ChartComponentProps) {
  console.log("ChartComponent render:", { chartType, data, title, className });

  if (!data) {
    console.warn("ChartComponent: No data provided");
    return <div className="text-slate-600">No data available</div>;
  }

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        if (!isBarChartData(data)) {
          console.error("Invalid bar chart data:", data);
          return <div>Invalid data format for bar chart</div>;
        }
        return (
          <div className="w-full h-full">
            <BarChart data={data} title={title} className={className} />
          </div>
        );

      case "line":
        if (!isLineChartData(data)) {
          console.error("Invalid line chart data:", data);
          return <div>Invalid data format for line chart</div>;
        }
        return (
          <div className="w-full h-full">
            <LineChart data={data} title={title} className={className} />
          </div>
        );

      case "pie":
        if (!isPieChartData(data)) {
          console.error("Invalid pie chart data:", data);
          return <div>Invalid data format for pie chart</div>;
        }
        return (
          <div className="w-full h-full">
            <PieChart data={data} title={title} className={className} />
          </div>
        );

      case "kpi":
        if (!isKpiData(data)) {
          console.error("Invalid KPI data:", data);
          return <div>Invalid data format for KPI card</div>;
        }
        return (
          <div className="w-full h-full">
            <KpiCard data={data} title={title} className={className} />
          </div>
        );

      case "table":
        if (!Array.isArray(data)) {
          console.error("Invalid table data:", data);
          return <div>Invalid data format for table</div>;
        }
        return <DataTable data={data} className={className} />;

      default:
        console.error("Unsupported chart type:", chartType);
        return <div>Unsupported chart type: {chartType}</div>;
    }
  };

  return (
    <ErrorBoundary>
      <div className={`chart-wrapper w-full h-full ${className}`}>
        {renderChart()}
      </div>
    </ErrorBoundary>
  );
}
