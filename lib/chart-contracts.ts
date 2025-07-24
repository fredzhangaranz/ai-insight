/**
 * Chart Data Contracts
 *
 * This file defines the TypeScript interfaces for the data shapes expected by each chart type.
 * These contracts serve as the bridge between our raw SQL data and the chart components.
 */

/**
 * Base interface for all chart data points
 * Ensures every data point has a unique identifier for React keys
 */
export interface BaseChartDataPoint {
  id?: string | number; // Optional as it will be auto-generated if not provided
}

/**
 * Bar Chart Data Contract
 * Used for vertical or horizontal bar charts showing category-value relationships
 * Example: Number of wounds by etiology
 */
export interface BarChartDataPoint extends BaseChartDataPoint {
  category: string;
  value: number;
  label?: string; // Optional label for the bar
  color?: string; // Optional custom color for specific bars
}

/**
 * Line Chart Data Contract
 * Used for time series or continuous data visualization
 * Example: Wound area measurements over time
 */
export interface LineChartDataPoint extends BaseChartDataPoint {
  x: string | number; // Date string or numeric value for x-axis
  y: number; // Metric value for y-axis
  label?: string; // Optional point label
}

/**
 * Pie Chart Data Contract
 * Used for showing part-to-whole relationships
 * Example: Distribution of wound types
 */
export interface PieChartDataPoint extends BaseChartDataPoint {
  label: string;
  value: number;
  percentage?: number; // Optional: can be calculated on the fly
  color?: string; // Optional custom slice color
}

/**
 * KPI (Key Performance Indicator) Data Contract
 * Used for single-value displays with optional context
 * Example: Average healing time
 */
export interface KpiData extends BaseChartDataPoint {
  label: string;
  value: string | number;
  unit?: string; // Optional unit of measurement
  trend?: {
    // Optional trend indicator
    direction: "up" | "down" | "neutral";
    value: number;
  };
  comparison?: {
    // Optional comparison value
    label: string;
    value: number;
  };
}

/**
 * Table Data Contract
 * Used for tabular data display
 * The columns are dynamically defined based on the data
 */
export interface TableData {
  columns: Array<{
    key: string;
    header: string;
    type: "string" | "number" | "date";
  }>;
  rows: Array<Record<string, any>>;
}

/**
 * Chart Type Union
 * Defines all available chart types in the application
 */
export type ChartType = "bar" | "line" | "pie" | "kpi" | "table";

/**
 * Chart Data Mapping
 * Defines how raw SQL data maps to chart data properties
 */
export interface ChartDataMapping {
  chartType: ChartType;
  mapping: {
    [key: string]: string; // Maps chart property names to SQL column names
  };
  options?: {
    sortBy?: string; // Column to sort by
    sortDirection?: "asc" | "desc";
    limit?: number; // Limit number of data points
    aggregation?: string; // Aggregation function if needed
  };
}

/**
 * Available Mappings
 * The complete set of possible chart types and their mappings for a given dataset
 */
export interface AvailableMappings {
  recommendedChartType: ChartType;
  mappings: {
    [K in ChartType]?: ChartDataMapping;
  };
}
