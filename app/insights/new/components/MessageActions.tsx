"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, BarChart3, Download, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveInsightDialog } from "./SaveInsightDialog";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface MessageActionsProps {
  result: InsightResult;
  customerId: string;
  messageId: string;
}

export function MessageActions({
  result,
  customerId,
  messageId,
}: MessageActionsProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showChartDialog, setShowChartDialog] = useState(false);

  const handleExportCSV = () => {
    if (!result.results) {
      return;
    }

    const { columns, rows } = result.results;
    const csvContent = [
      columns.join(","),
      ...rows.map((row) =>
        columns
          .map((col) => {
            const value = row[col];
            if (
              typeof value === "string" &&
              (value.includes(",") || value.includes('"'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value ?? "";
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `results-${messageId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySQL = () => {
    if (result.sql) {
      navigator.clipboard.writeText(result.sql);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSaveDialog(true)}
        >
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowChartDialog(true)}
          disabled={!result.results || result.results.rows.length === 0}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          Chart
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCSV}
          disabled={!result.results || result.results.rows.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleCopySQL}>
              Copy SQL
            </DropdownMenuItem>
            <DropdownMenuItem>Share Link</DropdownMenuItem>
            <DropdownMenuItem>Save as Template</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        result={result}
        customerId={customerId}
      />

      {showChartDialog && result.results && (
        <ChartConfigurationDialog
          isOpen={showChartDialog}
          onClose={() => setShowChartDialog(false)}
          data={result.results.rows}
          columns={result.results.columns}
        />
      )}
    </>
  );
}
