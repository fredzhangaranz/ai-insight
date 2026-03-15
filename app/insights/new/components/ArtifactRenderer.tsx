"use client";

import { shapeDataForChart } from "@/lib/data-shaper";
import type { InsightArtifact } from "@/lib/types/insight-artifacts";
import { ChartComponent } from "@/app/components/charts/chart-component";
import { ResultsTable } from "./ResultsTable";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

interface ArtifactRendererProps {
  artifact: InsightArtifact;
  rows: any[];
  columns: string[];
  onEditChart?: (artifact: Extract<InsightArtifact, { kind: "chart" }>) => void;
}

export function ArtifactRenderer({
  artifact,
  rows,
  columns,
  onEditChart,
}: ArtifactRendererProps) {
  if (artifact.kind === "entity_resolution") {
    return (
      <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
        Patient: {artifact.entity.displayLabel || artifact.entity.opaqueRef}
      </div>
    );
  }

  if (artifact.kind === "chart") {
    const mapping = Object.fromEntries(
      Object.entries(artifact.mapping).filter(([, value]) => Boolean(value))
    );
    if (artifact.chartType === "table") {
      return <ResultsTable columns={columns} rows={rows} maxRows={10} />;
    }

    const chartData = shapeDataForChart(
      rows,
      {
        chartType: artifact.chartType,
        mapping: mapping as any,
      },
      artifact.chartType
    );

    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {artifact.title}
            </h3>
            {artifact.reason && (
              <p className="mt-1 text-xs text-slate-500">{artifact.reason}</p>
            )}
          </div>
          {onEditChart && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditChart(artifact)}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Edit Chart
            </Button>
          )}
        </div>
        <ChartComponent
          chartType={artifact.chartType}
          data={chartData}
          title={undefined}
          className="w-full"
          chartProps={{
            dateFormat:
              artifact.chartType === "line" &&
              Boolean(artifact.mapping.x) &&
              /date|time|day|month|year|created|measured|assessment/i.test(
                artifact.mapping.x
              ),
            xAxisLabel: artifact.xAxisLabel,
            yAxisLabel: artifact.yAxisLabel,
          }}
        />
      </div>
    );
  }

  if (artifact.kind === "table") {
    return (
      <div className="rounded-lg border bg-white p-4">
        {artifact.title && (
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {artifact.title}
          </h3>
        )}
        <ResultsTable columns={artifact.columns} rows={rows} maxRows={10} />
      </div>
    );
  }

  if (artifact.kind === "sql") {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          {artifact.title || "Generated SQL"}
        </h3>
        <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          <code>{artifact.sql}</code>
        </pre>
      </div>
    );
  }

  if (artifact.kind === "assumption") {
    return (
      <div className="rounded-lg border bg-amber-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-amber-800">
          {artifact.title || "Assumptions"}
        </h3>
        <ul className="space-y-1 text-sm text-amber-700">
          {artifact.assumptions.map((assumption, index) => (
            <li key={index}>
              {assumption.term || assumption.intent || "Assumption"}:{" "}
              {assumption.assumedValue || assumption.assumed || assumption.reasoning}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
