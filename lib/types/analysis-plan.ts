import type { ChartType } from "@/lib/chart-contracts";

/**
 * Column mapping for table view
 */
export interface TableColumnMapping {
  key: string;
  header: string;
  type?: "string" | "number" | "date";
}

/**
 * Mapping definitions for each chart type
 */
export interface BarChartMapping {
  category: string;
  value: string;
  label?: string;
  color?: string;
}

export interface LineChartMapping {
  x: string;
  y: string;
  label?: string;
}

export interface PieChartMapping {
  label: string;
  value: string;
  color?: string;
}

export interface KpiChartMapping {
  label: string;
  value: string;
  unit?: string;
  trend?: {
    direction: string;
    value: string;
  };
  comparison?: {
    label: string;
    value: string;
  };
}

export interface TableMapping {
  columns: TableColumnMapping[];
}

/**
 * Available mappings for all chart types
 */
export interface AvailableMappings {
  bar?: BarChartMapping;
  line?: LineChartMapping;
  pie?: PieChartMapping;
  kpi?: KpiChartMapping;
  table?: TableMapping;
}

/**
 * Complete analysis plan structure
 */
export interface AnalysisPlan {
  explanation: string;
  recommendedChartType: ChartType;
  generatedSql: string;
  availableMappings: AvailableMappings;
}
