import type {
  BarChartDataPoint,
  LineChartDataPoint,
  PieChartDataPoint,
  KpiData,
} from "@/lib/chart-contracts";

export const exampleBarData: BarChartDataPoint[] = [
  { category: "Diabetic", value: 45, label: "Diabetic Wounds" },
  { category: "Pressure", value: 32, label: "Pressure Ulcers" },
  { category: "Surgical", value: 28, label: "Surgical Wounds" },
  { category: "Venous", value: 22, label: "Venous Ulcers" },
  { category: "Trauma", value: 15, label: "Traumatic Wounds" },
];

export const exampleLineData: LineChartDataPoint[] = [
  { x: "2023-01", y: 12, label: "Jan 2023" },
  { x: "2023-02", y: 15, label: "Feb 2023" },
  { x: "2023-03", y: 18, label: "Mar 2023" },
  { x: "2023-04", y: 22, label: "Apr 2023" },
  { x: "2023-05", y: 25, label: "May 2023" },
  { x: "2023-06", y: 28, label: "Jun 2023" },
];

export const examplePieData: PieChartDataPoint[] = [
  { label: "Stage 1", value: 30 },
  { label: "Stage 2", value: 25 },
  { label: "Stage 3", value: 20 },
  { label: "Stage 4", value: 15 },
  { label: "Unstageable", value: 10 },
];

export const exampleKpiData: KpiData = {
  label: "Average Healing Time",
  value: 28.5,
  unit: "days",
  trend: {
    direction: "down",
    value: 12,
  },
  comparison: {
    label: "Previous Month",
    value: 32.4,
  },
};

export const exampleTableData = [
  { id: 1, woundType: "Diabetic", count: 45, avgHealingTime: 28.5 },
  { id: 2, woundType: "Pressure", count: 32, avgHealingTime: 35.2 },
  { id: 3, woundType: "Surgical", count: 28, avgHealingTime: 21.8 },
  { id: 4, woundType: "Venous", count: 22, avgHealingTime: 42.1 },
  { id: 5, woundType: "Trauma", count: 15, avgHealingTime: 18.9 },
];

export const exampleAvailableMappings = {
  bar: {
    category: "woundType",
    value: "count",
    label: "woundType",
  },
  line: {
    x: "month",
    y: "count",
    label: "month",
  },
  pie: {
    label: "woundType",
    value: "count",
  },
  kpi: {
    label: "metric",
    value: "value",
    unit: "unit",
    trend: {
      direction: "trend_direction",
      value: "trend_value",
    },
    comparison: {
      label: "comparison_label",
      value: "comparison_value",
    },
  },
  table: {
    columns: [
      { key: "woundType", header: "Wound Type" },
      { key: "count", header: "Count" },
      { key: "avgHealingTime", header: "Avg. Healing Time (days)" },
    ],
  },
};
