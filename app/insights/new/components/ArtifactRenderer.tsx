"use client";

import { validateChartConfiguration } from "@/lib/chart-mapping-utils";
import { shapeDataForChart } from "@/lib/data-shaper";
import type { InsightArtifact } from "@/lib/types/insight-artifacts";
import type { ChartType } from "@/lib/chart-contracts";
import { ChartComponent } from "@/app/components/charts/chart-component";
import { ResultsTable } from "./ResultsTable";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

interface ArtifactRendererProps {
  artifact: InsightArtifact;
  rows: any[];
  columns: string[];
  onEditChart?: (artifact: Extract<InsightArtifact, { kind: "chart" }>) => void;
  chartOverride?: { chartType: ChartType; chartMapping: Record<string, string> };
}

export function ArtifactRenderer({
  artifact,
  rows,
  columns,
  onEditChart,
  chartOverride,
}: ArtifactRendererProps) {
  const renderTableArtifact = (title?: string, reason?: string) => (
    <div className="rounded-lg border bg-white p-4">
      {title && (
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          {title}
        </h3>
      )}
      {reason && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {reason}
        </p>
      )}
      <ResultsTable columns={columns} rows={rows} maxRows={10} />
    </div>
  );

  if (artifact.kind === "entity_resolution") {
    return (
      <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
        Patient: {artifact.entity.displayLabel || artifact.entity.opaqueRef}
      </div>
    );
  }

  if (artifact.kind === "chart") {
    const effectiveType = chartOverride?.chartType ?? artifact.chartType;
    const effectiveMapping = chartOverride?.chartMapping ?? artifact.mapping;
    const mapping = Object.fromEntries(
      Object.entries(effectiveMapping).filter(([, value]) => Boolean(value))
    );
    if (effectiveType === "table") {
      return renderTableArtifact(artifact.title, artifact.reason);
    }

    const validation = validateChartConfiguration(
      effectiveType,
      rows,
      mapping,
      columns
    );
    if (!validation.valid) {
      return renderTableArtifact(
        "Result table",
        validation.reason || artifact.reason
      );
    }

    const chartData = shapeDataForChart(
      rows,
      {
        chartType: effectiveType,
        mapping: validation.normalizedMapping as any,
      },
      effectiveType
    );

    const mappingForDateFormat = validation.normalizedMapping;
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
          chartType={effectiveType}
          data={chartData}
          title={undefined}
          className="w-full"
          chartProps={{
            dateFormat:
              effectiveType === "line" &&
              Boolean(mappingForDateFormat.x) &&
              /date|time|day|month|year|created|measured|assessment/i.test(
                mappingForDateFormat.x
              ),
            xAxisLabel: artifact.xAxisLabel,
            yAxisLabel: artifact.yAxisLabel,
          }}
        />
      </div>
    );
  }

  if (artifact.kind === "table") {
    return renderTableArtifact(artifact.title, artifact.reason);
  }

  return null;
}
