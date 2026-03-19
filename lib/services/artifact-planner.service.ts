import type { ChartType } from "@/lib/chart-contracts";
import {
  isDateField,
  isNumericField,
  pickMetricField,
  validateChartConfiguration,
} from "@/lib/chart-mapping-utils";
import type {
  InsightArtifact,
  ResolvedEntitySummary,
} from "@/lib/types/insight-artifacts";

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
      resolvedEntities,
      presentationIntent,
      preferredVisualization,
    } = input;
    const numericColumns = columns.filter((column) => isNumericField(rows, column));
    const dateColumns = columns.filter((column) => isDateField(rows, column));
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
      requestedChart === "line" ||
      requestedChart === "bar";
    const fallbackReason =
      "Chart unavailable for this result shape. Showing a table instead.";
    let tableReason: string | undefined;

    if (shouldChart && rows.length === 0) {
      tableReason = fallbackReason;
    }

    if (shouldChart && dateColumns.length > 0 && numericColumns.length > 0) {
      const x = dateColumns[0];
      const y = pickMetricField(numericColumns) || numericColumns[0];
      const chartType = requestedChart === "bar" ? "bar" : "line";
      const mapping =
        chartType === "bar"
          ? { category: x, value: y, label: pickSeriesKey(columns) || "" }
          : { x, y, label: pickSeriesKey(columns) || "" };
      const validation = validateChartConfiguration(
        chartType,
        rows,
        mapping,
        columns
      );

      if (validation.valid) {
        artifacts.push({
          kind: "chart",
          chartType,
          title: "Trend over time",
          mapping: validation.normalizedMapping,
          seriesKey: pickSeriesKey(columns),
          reason: "Detected time-series question with date and numeric results.",
          primary: true,
          xAxisLabel: x,
          yAxisLabel: y,
        });
      } else {
        tableReason = validation.reason || fallbackReason;
      }
    } else if (
      presentationIntent !== "table" &&
      numericColumns.length > 0 &&
      nonPatientCategoryColumns.length > 0
    ) {
      const chartType = requestedChart === "kpi" ? "kpi" : "bar";
      const mapping =
        chartType === "kpi"
          ? { label: nonPatientCategoryColumns[0], value: numericColumns[0] }
          : { category: nonPatientCategoryColumns[0], value: numericColumns[0] };
      const validation = validateChartConfiguration(
        chartType,
        rows,
        mapping,
        columns
      );

      if (validation.valid) {
        artifacts.push({
          kind: "chart",
          chartType,
          title:
            requestedChart === "kpi" ? "Key metric" : "Comparison",
          mapping: validation.normalizedMapping,
          reason: "Detected categorical comparison with numeric values.",
          primary: true,
          xAxisLabel: nonPatientCategoryColumns[0],
          yAxisLabel: numericColumns[0],
        });
      } else {
        tableReason = validation.reason || fallbackReason;
      }
    } else if (
      presentationIntent !== "table" &&
      rows.length === 1 &&
      numericColumns.length > 0
    ) {
      const validation = validateChartConfiguration(
        "kpi",
        rows,
        {
          label: nonPatientCategoryColumns[0] || numericColumns[0],
          value: numericColumns[0],
        },
        columns
      );

      if (validation.valid) {
        artifacts.push({
          kind: "chart",
          chartType: "kpi",
          title: "Key metric",
          mapping: validation.normalizedMapping,
          reason: "Single-row numeric result is best shown as a KPI.",
          primary: true,
        });
      } else {
        tableReason = validation.reason || fallbackReason;
      }
    }

    artifacts.push({
      kind: "table",
      title: "Result table",
      columns,
      primary: !artifacts.some((artifact) => artifact.kind === "chart"),
      reason: !artifacts.some((artifact) => artifact.kind === "chart")
        ? tableReason
        : undefined,
    });

    // SQL and assumptions are shown in InspectionPanel only, not as artifacts

    return artifacts;
  }
}
