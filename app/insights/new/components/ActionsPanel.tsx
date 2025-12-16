// app/insights/new/components/ActionsPanel.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Save,
  FileText,
  Download,
  MessageSquare,
} from "lucide-react";
import { SaveInsightDialog } from "./SaveInsightDialog";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import { InsightResult } from "@/lib/hooks/useInsights";
import type { ChartType } from "@/lib/chart-contracts";

interface ActionsPanelProps {
  result: InsightResult;
  customerId: string;
  onRefine: (question: string) => void;
}

export function ActionsPanel({
  result,
  customerId,
  onRefine,
}: ActionsPanelProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [chartConfig, setChartConfig] = useState<{
    chartType: ChartType;
    chartMapping: Record<string, string>;
  } | null>(null);

  const handleExportCSV = () => {
    if (!result.results || result.results.rows.length === 0) {
      alert("No data to export");
      return;
    }

    const results = result.results;
    const csv = [
      results.columns.join(","),
      ...results.rows.map((row) =>
        results.columns.map((col) => {
          const value = row[col];
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = value !== null && value !== undefined ? String(value) : "";
          return stringValue.includes(",") || stringValue.includes('"')
            ? `"${stringValue.replace(/"/g, '""')}"`
            : stringValue;
        }).join(",")
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

  const handleChartSave = (config: {
    chartType: ChartType;
    chartMapping: Record<string, string>;
  }) => {
    // Save the chart config and open the save insight dialog
    setChartConfig(config);
    setShowChartDialog(false);
    setShowSaveDialog(true);
  };

  const handleSaveDialogClose = () => {
    setShowSaveDialog(false);
    // Reset chart config when save dialog closes
    setChartConfig(null);
  };

  return (
    <>
      <div className="bg-gray-50 rounded-lg border p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          What would you like to do next?
        </p>

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
            disabled={!result.results || result.results.rows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>

          <Button variant="outline" size="sm" onClick={() => onRefine("")}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Ask Follow-up
          </Button>

          {/* Chart and Template buttons - Phase 7D */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChartDialog(true)}
            disabled={!result.results || result.results.rows.length === 0}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Create Chart
          </Button>

          <Button variant="outline" size="sm" disabled title="Coming in Phase 7F">
            <FileText className="mr-2 h-4 w-4" />
            Save as Template
          </Button>
        </div>
      </div>

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={handleSaveDialogClose}
        result={result}
        customerId={customerId}
        chartConfig={chartConfig}
      />

      {showChartDialog && result.results && (
        <ChartConfigurationDialog
          isOpen={showChartDialog}
          onClose={() => setShowChartDialog(false)}
          queryResults={result.results.rows}
          chartType="bar"
          title={result.question || "Query Results"}
          onSave={handleChartSave}
          saveButtonText="Continue to Save"
          allowTypeChange={true}
          onTypeChange={() => {}}
        />
      )}
    </>
  );
}
