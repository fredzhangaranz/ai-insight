import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  KpiData,
  ChartType,
} from "./chart-contracts";

type RawDataRecord = Record<string, any>;
type ChartData =
  | BarChartDataPoint[]
  | LineChartDataPoint[]
  | PieChartDataPoint[]
  | KpiData;

// Base mapping interface
interface BaseMapping {
  [key: string]: string | undefined;
}

// Specific mapping interfaces for each chart type
interface BarChartMapping extends BaseMapping {
  category: string;
  value: string;
  label?: string;
  color?: string;
}

interface LineChartMapping extends BaseMapping {
  x: string;
  y: string;
  label?: string;
}

interface PieChartMapping extends BaseMapping {
  label: string;
  value: string;
  color?: string;
}

export interface KpiDataMapping {
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

// Chart data mapping with specific mapping types
export interface ChartDataMapping {
  chartType: ChartType;
  mapping:
    | BarChartMapping
    | LineChartMapping
    | PieChartMapping
    | KpiDataMapping;
  options?: {
    sortBy?: string;
    sortDirection?: "asc" | "desc";
    limit?: number;
    aggregation?: string;
  };
}

/**
 * Shapes raw SQL data into the correct format for each chart type based on the mapping configuration.
 * @param rawData The raw data array from the SQL query
 * @param mapping The mapping configuration that defines how to transform the data
 * @param chartType The type of chart the data is being shaped for
 * @returns Properly shaped data that matches the chart's contract
 */
export function shapeDataForChart(
  rawData: RawDataRecord[],
  mapping: ChartDataMapping,
  chartType: ChartType
): ChartData {
  // Apply sorting if specified in the mapping options
  let processedData = [...rawData];
  if (mapping.options?.sortBy) {
    const direction = mapping.options.sortDirection || "asc";
    processedData.sort((a, b) => {
      const aVal = a[mapping.options!.sortBy!];
      const bVal = b[mapping.options!.sortBy!];
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  // Apply limit if specified
  if (mapping.options?.limit) {
    processedData = processedData.slice(0, mapping.options.limit);
  }

  switch (chartType) {
    case "bar":
      return shapeBarChartData(
        processedData,
        mapping as ChartDataMapping & { mapping: BarChartMapping }
      );
    case "line":
      return shapeLineChartData(
        processedData,
        mapping as ChartDataMapping & { mapping: LineChartMapping }
      );
    case "pie":
      return shapePieChartData(
        processedData,
        mapping as ChartDataMapping & { mapping: PieChartMapping }
      );
    case "kpi":
      return shapeKpiData(
        processedData,
        mapping as ChartDataMapping & { mapping: KpiDataMapping }
      );
    case "table":
      throw new Error("Table data does not need shaping");
    default:
      throw new Error(`Unsupported chart type: ${chartType}`);
  }
}

/**
 * Shapes data for bar charts
 * Example mapping: { category: 'etiology', value: 'count' }
 */
function shapeBarChartData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: BarChartMapping }
): BarChartDataPoint[] {
  return data.map((record, index) => ({
    category: String(record[mapping.mapping.category]),
    value: Number(record[mapping.mapping.value]),
    id: record.id?.toString() || `bar-${index}`,
    label: mapping.mapping.label
      ? String(record[mapping.mapping.label])
      : undefined,
    color: mapping.mapping.color
      ? String(record[mapping.mapping.color])
      : undefined,
  }));
}

/**
 * Shapes data for line charts
 * Example mapping: { x: 'date', y: 'woundArea' }
 */
function shapeLineChartData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: LineChartMapping }
): LineChartDataPoint[] {
  return data.map((record, index) => ({
    x: record[mapping.mapping.x],
    y: Number(record[mapping.mapping.y]),
    id: record.id?.toString() || `point-${index}`,
    label: mapping.mapping.label
      ? String(record[mapping.mapping.label])
      : undefined,
  }));
}

/**
 * Shapes data for pie charts
 * Example mapping: { label: 'etiology', value: 'count' }
 */
function shapePieChartData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: PieChartMapping }
): PieChartDataPoint[] {
  const total = data.reduce(
    (sum, record) => sum + Number(record[mapping.mapping.value]),
    0
  );

  return data.map((record, index) => ({
    label: String(record[mapping.mapping.label]),
    value: Number(record[mapping.mapping.value]),
    id: record.id?.toString() || `slice-${index}`,
    percentage: (Number(record[mapping.mapping.value]) / total) * 100,
    color: mapping.mapping.color
      ? String(record[mapping.mapping.color])
      : undefined,
  }));
}

/**
 * Shapes data for KPI cards
 * Example mapping: {
 *   label: 'metricName',
 *   value: 'currentValue',
 *   trend: { value: 'changeValue', direction: 'changeDirection' }
 * }
 */
function shapeKpiData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: KpiDataMapping }
): KpiData {
  // KPI typically expects a single record
  const record = data[0];
  if (!record) {
    throw new Error("No data available for KPI");
  }

  const kpiData: KpiData = {
    label: String(record[mapping.mapping.label]),
    value: record[mapping.mapping.value],
    unit: mapping.mapping.unit
      ? String(record[mapping.mapping.unit])
      : undefined,
  };

  // Add trend if mapping includes it
  if (mapping.mapping.trend) {
    const trendDirection = record[mapping.mapping.trend.direction];
    kpiData.trend = {
      direction: trendDirection as "up" | "down" | "neutral",
      value: Number(record[mapping.mapping.trend.value]),
    };
  }

  // Add comparison if mapping includes it
  if (mapping.mapping.comparison) {
    kpiData.comparison = {
      label: String(record[mapping.mapping.comparison.label]),
      value: Number(record[mapping.mapping.comparison.value]),
    };
  }

  return kpiData;
}

/**
 * Helper function to ensure a value is a valid number
 */
function ensureNumber(value: any): number {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`Value ${value} cannot be converted to a number`);
  }
  return num;
}
