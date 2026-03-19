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
  return data
    .map((record, index) => {
      const category = record[mapping.mapping.category];
      const value = Number(record[mapping.mapping.value]);

      if (
        category === null ||
        category === undefined ||
        category === "" ||
        !Number.isFinite(value)
      ) {
        return null;
      }

      return {
        category: String(category),
        value,
        id: record.id?.toString() || `bar-${index}`,
        label: mapping.mapping.label
          ? String(record[mapping.mapping.label])
          : undefined,
        color: mapping.mapping.color
          ? String(record[mapping.mapping.color])
          : undefined,
      };
    })
    .filter((point): point is BarChartDataPoint => point !== null);
}

/**
 * Shapes data for line charts
 * Example mapping: { x: 'date', y: 'woundArea' }
 */
function shapeLineChartData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: LineChartMapping }
): LineChartDataPoint[] {
  return data
    .map((record, index) => {
      const x = record[mapping.mapping.x];
      const y = Number(record[mapping.mapping.y]);

      if (
        x === null ||
        x === undefined ||
        x === "" ||
        !Number.isFinite(y)
      ) {
        return null;
      }

      return {
        x,
        y,
        id: record.id?.toString() || `point-${index}`,
        label: mapping.mapping.label
          ? String(record[mapping.mapping.label])
          : undefined,
      };
    })
    .filter((point): point is LineChartDataPoint => point !== null);
}

/**
 * Shapes data for pie charts
 * Example mapping: { label: 'etiology', value: 'count' }
 */
function shapePieChartData(
  data: RawDataRecord[],
  mapping: ChartDataMapping & { mapping: PieChartMapping }
): PieChartDataPoint[] {
  const shaped = data
    .map((record, index) => {
      const label = record[mapping.mapping.label];
      const value = Number(record[mapping.mapping.value]);

      if (
        label === null ||
        label === undefined ||
        label === "" ||
        !Number.isFinite(value)
      ) {
        return null;
      }

      return {
        label: String(label),
        value,
        id: record.id?.toString() || `slice-${index}`,
        color: mapping.mapping.color
          ? String(record[mapping.mapping.color])
          : undefined,
      };
    })
    .filter(
      (
        point
      ): point is Omit<PieChartDataPoint, "percentage"> & { value: number } =>
        point !== null
    );
  const total = shaped.reduce((sum, record) => sum + record.value, 0);

  return shaped.map((record) => ({
    ...record,
    percentage: total > 0 ? (record.value / total) * 100 : 0,
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
