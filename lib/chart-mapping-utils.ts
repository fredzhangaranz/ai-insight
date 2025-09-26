import type { ChartType } from "./chart-contracts";

type AnyMapping = Record<string, any> | undefined | null;

function coalesce(mapping: Record<string, any>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = mapping[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

export function normalizeChartMapping(
  chartType: ChartType,
  mapping: AnyMapping
): AnyMapping {
  if (!mapping || typeof mapping !== "object") return mapping;

  const normalized: Record<string, any> = { ...mapping };

  switch (chartType) {
    case "bar": {
      const category =
        normalized.category ||
        coalesce(normalized, ["xAxis", "dimension", "group", "label"]);
      const value =
        normalized.value ||
        coalesce(normalized, ["yAxis", "metric", "count", "amount", "valueField"]);
      if (category) normalized.category = category;
      if (value) normalized.value = value;
      break;
    }
    case "line": {
      const x = normalized.x || coalesce(normalized, ["xAxis", "date", "time", "category"]);
      const y = normalized.y || coalesce(normalized, ["yAxis", "value", "metric"]);
      if (x) normalized.x = x;
      if (y) normalized.y = y;
      break;
    }
    case "pie": {
      const label =
        normalized.label ||
        coalesce(normalized, ["category", "segment", "name", "dimension"]);
      const value =
        normalized.value ||
        coalesce(normalized, ["count", "amount", "metric", "yAxis"]);
      if (label) normalized.label = label;
      if (value) normalized.value = value;
      break;
    }
    case "kpi": {
      const label = normalized.label || coalesce(normalized, ["name", "title", "metric"]);
      const value =
        normalized.value ||
        coalesce(normalized, ["amount", "metricValue", "score", "currentValue"]);
      if (label) normalized.label = label;
      if (value) normalized.value = value;
      break;
    }
    case "table":
    default:
      break;
  }

  return normalized;
}

export function normalizeAvailableMappings(
  available: Record<string, any>
): Record<string, any> {
  const normalized: Record<string, any> = {};

  if (!available || typeof available !== "object") {
    return normalized;
  }

  for (const [chartType, mapping] of Object.entries(available)) {
    normalized[chartType] = normalizeChartMapping(chartType as ChartType, mapping);
  }

  return normalized;
}

