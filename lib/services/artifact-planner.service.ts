import type { ChartType } from "@/lib/chart-contracts";
import type {
  InsightArtifact,
  ResolvedEntitySummary,
} from "@/lib/types/insight-artifacts";

function isDateValue(value: unknown): boolean {
  if (value instanceof Date) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

function isNumericColumn(rows: any[], column: string): boolean {
  const values = rows
    .map((row) => row?.[column])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (values.length === 0) return false;
  if (values.some((value) => isDateValue(value))) {
    return false;
  }
  return values.every((value) => !Number.isNaN(Number(value)));
}

function isDateLikeColumn(column: string, rows: any[]): boolean {
  if (/(date|time|day|month|year|created|measured|assessment)/i.test(column)) {
    return true;
  }

  const sample = rows
    .map((row) => row?.[column])
    .find((value) => typeof value === "string" || value instanceof Date);
  if (!sample) return false;
  return !Number.isNaN(new Date(sample).getTime());
}

function looksLikeVisualizationRequest(question: string): boolean {
  return /(chart|graph|plot|visual|trend|over time|change over time|progression|healing progression)/i.test(
    question
  );
}

function detectPreferredChart(question: string): ChartType | null {
  if (/(line chart|trend|over time|change over time|progression)/i.test(question)) {
    return "line";
  }
  if (/(bar chart|compare|comparison|by\b)/i.test(question)) {
    return "bar";
  }
  if (/(kpi|single metric|total|count)/i.test(question)) {
    return "kpi";
  }
  if (/(table|list)/i.test(question)) {
    return "table";
  }
  return null;
}

function pickSeriesKey(columns: string[]): string | undefined {
  return columns.find((column) =>
    /(wound|location|label|name)$/i.test(column) &&
    !/patient/i.test(column)
  );
}

function pickMetricColumn(columns: string[]): string | undefined {
  const preferredPatterns = [
    /(area|volume|size|length|width|depth|height)/i,
    /(count|total|avg|average|mean|median|rate|score|value|percentage|percent)/i,
  ];

  for (const pattern of preferredPatterns) {
    const match = columns.find(
      (column) => pattern.test(column) && !/id$|date|time|day|month|year/i.test(column)
    );
    if (match) {
      return match;
    }
  }

  return columns.find((column) => !/id$|date|time|day|month|year/i.test(column));
}

export class ArtifactPlannerService {
  plan(input: {
    question: string;
    rows: any[];
    columns: string[];
    sql?: string;
    assumptions?: Array<Record<string, any>>;
    resolvedEntities?: ResolvedEntitySummary[];
    presentationIntent?: "chart" | "table" | "either";
    preferredVisualization?: "line" | "bar" | "kpi" | "table" | null;
  }): InsightArtifact[] {
    const {
      question,
      rows,
      columns,
      sql,
      assumptions,
      resolvedEntities,
      presentationIntent,
      preferredVisualization,
    } = input;
    const numericColumns = columns.filter((column) => isNumericColumn(rows, column));
    const dateColumns = columns.filter((column) => isDateLikeColumn(column, rows));
    const nonPatientCategoryColumns = columns.filter(
      (column) =>
        !numericColumns.includes(column) &&
        !/patient(name|_name|first|last)/i.test(column)
    );

    const artifacts: InsightArtifact[] = [];

    for (const entity of resolvedEntities || []) {
      artifacts.push({
        kind: "entity_resolution",
        entity,
      });
    }

    const requestedChart =
      preferredVisualization || detectPreferredChart(question);
    const shouldChart =
      presentationIntent === "chart" ||
      looksLikeVisualizationRequest(question) ||
      requestedChart === "line";

    if (shouldChart && dateColumns.length > 0 && numericColumns.length > 0) {
      const x = dateColumns[0];
      const y = pickMetricColumn(numericColumns) || numericColumns[0];
      artifacts.push({
        kind: "chart",
        chartType: requestedChart === "bar" ? "bar" : "line",
        title: "Trend over time",
        mapping: { x, y, label: pickSeriesKey(columns) || "" },
        seriesKey: pickSeriesKey(columns),
        reason: "Detected time-series question with date and numeric results.",
        primary: true,
        xAxisLabel: x,
        yAxisLabel: y,
      });
    } else if (
      presentationIntent !== "table" &&
      numericColumns.length > 0 &&
      nonPatientCategoryColumns.length > 0
    ) {
      artifacts.push({
        kind: "chart",
        chartType: requestedChart === "kpi" ? "kpi" : "bar",
        title:
          requestedChart === "kpi" ? "Key metric" : "Comparison",
        mapping:
          requestedChart === "kpi"
            ? { label: nonPatientCategoryColumns[0], value: numericColumns[0] }
            : { category: nonPatientCategoryColumns[0], value: numericColumns[0] },
        reason: "Detected categorical comparison with numeric values.",
        primary: true,
        xAxisLabel: nonPatientCategoryColumns[0],
        yAxisLabel: numericColumns[0],
      });
    } else if (
      presentationIntent !== "table" &&
      rows.length === 1 &&
      numericColumns.length > 0
    ) {
      artifacts.push({
        kind: "chart",
        chartType: "kpi",
        title: "Key metric",
        mapping: {
          label: nonPatientCategoryColumns[0] || numericColumns[0],
          value: numericColumns[0],
        },
        reason: "Single-row numeric result is best shown as a KPI.",
        primary: true,
      });
    }

    artifacts.push({
      kind: "table",
      title: "Result table",
      columns,
      primary: !artifacts.some((artifact) => artifact.kind === "chart"),
    });

    if (sql) {
      artifacts.push({
        kind: "sql",
        title: "Generated SQL",
        sql,
      });
    }

    if (assumptions && assumptions.length > 0) {
      artifacts.push({
        kind: "assumption",
        title: "Assumptions",
        assumptions,
      });
    }

    return artifacts;
  }
}
