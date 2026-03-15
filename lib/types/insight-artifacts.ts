import type { ChartType } from "@/lib/chart-contracts";

export interface ResolvedEntitySummary {
  kind: "patient";
  opaqueRef: string;
  displayLabel?: string;
  matchType: "patient_id" | "domain_id" | "full_name";
  requiresConfirmation?: boolean;
  unitName?: string | null;
}

export interface EntityResolutionArtifact {
  kind: "entity_resolution";
  entity: ResolvedEntitySummary;
}

export interface ChartArtifact {
  kind: "chart";
  chartType: ChartType;
  title: string;
  mapping: Record<string, string>;
  reason?: string;
  seriesKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  primary?: boolean;
}

export interface TableArtifact {
  kind: "table";
  title?: string;
  columns: string[];
  primary?: boolean;
}

export interface SqlArtifact {
  kind: "sql";
  title?: string;
  sql: string;
}

export interface AssumptionArtifact {
  kind: "assumption";
  title?: string;
  assumptions: Array<Record<string, any>>;
}

export interface ClarificationArtifact {
  kind: "clarification";
  title?: string;
  reason?: string;
}

export type InsightArtifact =
  | EntityResolutionArtifact
  | ChartArtifact
  | TableArtifact
  | SqlArtifact
  | AssumptionArtifact
  | ClarificationArtifact;
