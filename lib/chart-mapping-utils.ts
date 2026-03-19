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

function isDateValue(value: unknown): boolean {
  if (value instanceof Date) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

function isDateField(rows: Record<string, any>[], field: string): boolean {
  if (/(date|time|day|month|year|created|measured|assessment)/i.test(field)) {
    return true;
  }
  return rows.some((row) => isDateValue(row?.[field]));
}

function isNumericField(rows: Record<string, any>[], field: string): boolean {
  const values = rows
    .map((row) => row?.[field])
    .filter((value) => value !== null && value !== undefined && value !== "");

  if (values.length === 0) {
    return false;
  }
  if (values.some((value) => isDateValue(value))) {
    return false;
  }
  return values.every((value) => !Number.isNaN(Number(value)));
}

function pickMetricField(fields: string[]): string | undefined {
  const preferredPatterns = [
    /(area|volume|size|length|width|depth|height)/i,
    /(count|total|avg|average|mean|median|rate|score|value|percentage|percent)/i,
  ];

  for (const pattern of preferredPatterns) {
    const match = fields.find(
      (field) => pattern.test(field) && !/id$|date|time|day|month|year/i.test(field)
    );
    if (match) {
      return match;
    }
  }

  return fields.find((field) => !/id$|date|time|day|month|year/i.test(field));
}

export function inferChartMapping(
  chartType: ChartType,
  rows: Record<string, any>[],
  mapping: AnyMapping
): Record<string, string> {
  const normalized = {
    ...(normalizeChartMapping(chartType, mapping) as Record<string, string>),
  };
  const availableFields = rows[0] ? Object.keys(rows[0]) : [];
  const dateFields = availableFields.filter((field) => isDateField(rows, field));
  const numericFields = availableFields.filter((field) => isNumericField(rows, field));
  const nonNumericFields = availableFields.filter(
    (field) => !dateFields.includes(field) && !numericFields.includes(field)
  );

  switch (chartType) {
    case "line": {
      if (!normalized.x || !availableFields.includes(normalized.x)) {
        normalized.x = dateFields[0] || nonNumericFields[0] || availableFields[0] || "";
      }
      if (
        !normalized.y ||
        !availableFields.includes(normalized.y) ||
        normalized.y === normalized.x ||
        !numericFields.includes(normalized.y)
      ) {
        normalized.y = pickMetricField(numericFields) || numericFields[0] || "";
      }
      break;
    }
    case "bar": {
      if (!normalized.category || !availableFields.includes(normalized.category)) {
        normalized.category =
          nonNumericFields[0] || dateFields[0] || availableFields[0] || "";
      }
      if (
        !normalized.value ||
        !availableFields.includes(normalized.value) ||
        normalized.value === normalized.category ||
        !numericFields.includes(normalized.value)
      ) {
        normalized.value = pickMetricField(numericFields) || numericFields[0] || "";
      }
      break;
    }
    case "pie":
    case "kpi": {
      if (!normalized.label || !availableFields.includes(normalized.label)) {
        normalized.label =
          nonNumericFields[0] || dateFields[0] || availableFields[0] || "";
      }
      if (
        !normalized.value ||
        !availableFields.includes(normalized.value) ||
        normalized.value === normalized.label ||
        !numericFields.includes(normalized.value)
      ) {
        normalized.value = pickMetricField(numericFields) || numericFields[0] || "";
      }
      break;
    }
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
