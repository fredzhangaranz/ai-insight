"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Download, Eye, EyeOff } from "lucide-react";
import { ArtifactRenderer } from "./ArtifactRenderer";
import { StatusBadge } from "./StatusBadge";
import { InspectionPanel } from "./InspectionPanel";
import { SaveInsightDialog } from "./SaveInsightDialog";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { ChartType } from "@/lib/chart-contracts";
import type { ChartArtifact } from "@/lib/types/insight-artifacts";
import { ResultsTable } from "./ResultsTable";

interface ResultBlockProps {
  result: InsightResult;
  customerId: string;
  onChallengeAssumption?: (assumption: string, explanation: string) => void;
}

export function ResultBlock({
  result,
  customerId,
  onChallengeAssumption,
}: ResultBlockProps) {
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [editingChartIndex, setEditingChartIndex] = useState<number | null>(null);
  const [chartOverrides, setChartOverrides] = useState<
    Record<number, { chartType: ChartType; chartMapping: Record<string, string> }>
  >({});
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [initialChartMapping, setInitialChartMapping] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [showKpiVisualization, setShowKpiVisualization] = useState(false);
  const handleEditChart = (artifact: ChartArtifact, index: number) => {
    setEditingChartIndex(index);
    setChartType(chartOverrides[index]?.chartType ?? artifact.chartType);
    setInitialChartMapping(chartOverrides[index]?.chartMapping ?? artifact.mapping);
    setShowChartDialog(true);
  };

  const handleApplyChart = (config: {
    chartType: ChartType;
    chartMapping: Record<string, string>;
  }) => {
    if (editingChartIndex !== null) {
      setChartOverrides((prev) => ({ ...prev, [editingChartIndex]: config }));
    }
    setShowChartDialog(false);
    setEditingChartIndex(null);
    setInitialChartMapping(undefined);
  };

  const handleExportCSV = () => {
    if (!result.results || result.results.rows.length === 0) {
      alert("No data to export");
      return;
    }
    const results = result.results;
    const csv = [
      results.columns.join(","),
      ...results.rows.map((row) =>
        results.columns
          .map((col) => {
            const value = row[col];
            const stringValue =
              value !== null && value !== undefined ? String(value) : "";
            return stringValue.includes(",") || stringValue.includes('"')
              ? `"${stringValue.replace(/"/g, '""')}"`
              : stringValue;
          })
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insight-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const recordCount = result.results?.rows.length ?? 0;
  const rows = result.results?.rows ?? [];
  const columns = result.results?.columns ?? [];
  const artifacts = result.artifacts ?? [];
  
  // Check if this is a single-value result (KPI candidate)
  const isKpiResult = recordCount === 1 && artifacts.some((a) => a.kind === "chart");
  const kpiArtifact = isKpiResult ? artifacts.find((a) => a.kind === "chart") : null;
  
  const displayArtifacts = artifacts.filter(
    (a) =>
      a.kind === "chart" || a.kind === "table" || a.kind === "entity_resolution"
  );
  
  // For single-value results, optionally hide KPI from default view
  const visibleArtifacts = isKpiResult && !showKpiVisualization
    ? displayArtifacts.filter((a) => a.kind !== "chart")
    : displayArtifacts;
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        {/* Left: Chart/Table hero */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Results ({recordCount} records)
            </h3>
          </div>
          
          {/* Text-first display for single-value results */}
          {isKpiResult && !showKpiVisualization && rows.length === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-6 text-center">
                <div className="space-y-2">
                  {columns.map((col) => {
                    const value = rows[0][col];
                    const isNumeric = typeof value === "number";
                    return (
                      <div key={col} className={isNumeric ? "" : "text-xs text-slate-500"}>
                        {isNumeric ? (
                          <div className="text-4xl font-bold text-slate-900">
                            {value}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600">{value}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1">{col}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Optional visualization toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKpiVisualization(true)}
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualize as KPI Card
              </Button>
            </div>
          )}
          
          {/* Regular artifact rendering (charts, tables, etc.) */}
          {(!isKpiResult || showKpiVisualization) && visibleArtifacts.length > 0 ? (
            <div className="space-y-4">
              {/* Toggle back to text for single values */}
              {isKpiResult && showKpiVisualization && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKpiVisualization(false)}
                  className="w-full"
                >
                  <EyeOff className="h-4 w-4 mr-2" />
                  Show as Text
                </Button>
              )}
              
              {visibleArtifacts.map((artifact, i) => {
                const origIndex = artifacts.indexOf(artifact);
                return (
                  <ArtifactRenderer
                    key={`${artifact.kind}-${origIndex}`}
                    artifact={artifact}
                    rows={rows}
                    columns={columns}
                    onEditChart={
                      artifact.kind === "chart"
                        ? (a) => handleEditChart(a, origIndex)
                        : undefined
                    }
                    chartOverride={
                      artifact.kind === "chart"
                        ? chartOverrides[origIndex]
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ) : !isKpiResult && displayArtifacts.length === 0 ? (
            <div className="overflow-x-auto">
              <ResultsTable columns={columns} rows={rows} maxRows={10} />
              {recordCount > 10 && (
                <div className="text-sm text-gray-500 mt-4 text-center">
                  Showing first 10 of {recordCount} rows
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: StatusBadge + compact actions */}
        <div className="flex flex-col gap-4 lg:min-w-[200px]">
          <StatusBadge
            validation={result.sqlValidation}
            assumptionsCount={result.assumptions?.length ?? 0}
            onClick={() => setInspectionOpen(true)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
            >
              <Save className="mr-2 h-4 w-4" />
              Save Insight
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={recordCount === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Inspection Panel - collapsed by default */}
      <InspectionPanel
        result={result}
        onChallengeAssumption={onChallengeAssumption}
        open={inspectionOpen}
        onOpenChange={setInspectionOpen}
      />

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        result={result}
        customerId={customerId}
      />

      {showChartDialog && result.results && (
        <ChartConfigurationDialog
          isOpen={showChartDialog}
          onClose={() => {
            setShowChartDialog(false);
            setEditingChartIndex(null);
            setInitialChartMapping(undefined);
          }}
          queryResults={result.results.rows}
          chartType={chartType}
          initialMapping={initialChartMapping}
          title={result.question || "Query Results"}
          mode="preview"
          onApply={handleApplyChart}
          allowTypeChange={true}
          onTypeChange={setChartType}
        />
      )}
    </div>
  );
}
