/**
 * Show Data Panel Component
 * Displays SQL query, raw results, and coverage warnings
 */

"use client";

import { useState, useEffect } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ShowDataPanelProps {
  sqlQuery: string;
  resultData: any[];
  tableName?: string;
  columnsUsed?: string[];
}

const COVERAGE_THRESHOLDS = [
  {
    maxPct: 50,
    variant: "destructive" as const,
    label: "Only {pct}% of records have this data — results may be misleading",
  },
  {
    maxPct: 90,
    variant: "default" as const,
    label: "{pct}% of records have this field populated",
  },
  { maxPct: 100, variant: null, label: null },
] as const;

export function ShowDataPanel({
  sqlQuery,
  resultData,
  tableName,
  columnsUsed,
}: ShowDataPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coverageStats, setCoverageStats] = useState<Record<string, any>>({});
  const [loadingCoverage, setLoadingCoverage] = useState(false);

  useEffect(() => {
    if (isOpen && tableName && columnsUsed && columnsUsed.length > 0) {
      fetchCoverageStats();
    }
  }, [isOpen, tableName, columnsUsed]);

  const fetchCoverageStats = async () => {
    if (!tableName || !columnsUsed) return;

    setLoadingCoverage(true);
    try {
      const response = await fetch(
        `/api/data-viewer/coverage?table=${tableName}&columns=${columnsUsed.join(",")}`
      );

      if (response.ok) {
        const data = await response.json();
        setCoverageStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch coverage stats:", error);
    } finally {
      setLoadingCoverage(false);
    }
  };

  const getCoverageWarnings = () => {
    const warnings: Array<{
      column: string;
      pct: number;
      variant: "destructive" | "default";
      label: string;
    }> = [];

    for (const [column, stats] of Object.entries(coverageStats)) {
      const pct = (stats as any).coveragePct;

      for (const threshold of COVERAGE_THRESHOLDS) {
        if (pct <= threshold.maxPct && threshold.variant && threshold.label) {
          warnings.push({
            column,
            pct,
            variant: threshold.variant,
            label: threshold.label.replace("{pct}", pct.toFixed(1)),
          });
          break;
        }
      }
    }

    return warnings;
  };

  const warnings = getCoverageWarnings();

  return (
    <div className="mt-4 border rounded-lg">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium">Show Data</span>
        {isOpen ? (
          <ChevronUpIcon className="w-4 h-4" />
        ) : (
          <ChevronDownIcon className="w-4 h-4" />
        )}
      </Button>

      {isOpen && (
        <div className="border-t p-4 space-y-4">
          {/* Coverage Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((warning, idx) => (
                <Alert key={idx} variant={warning.variant}>
                  <AlertDescription>
                    <strong>{warning.column}:</strong> {warning.label}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* SQL Query */}
          <div>
            <h4 className="text-sm font-semibold mb-2">SQL Query</h4>
            <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto">
              {sqlQuery}
            </pre>
          </div>

          {/* Result Data */}
          <div>
            <h4 className="text-sm font-semibold mb-2">
              Result Data ({resultData.length} rows)
            </h4>
            {resultData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {Object.keys(resultData[0]).map((key) => (
                        <th
                          key={key}
                          className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {resultData.map((row, idx) => (
                      <tr key={idx}>
                        {Object.values(row).map((value, vIdx) => (
                          <td
                            key={vIdx}
                            className="px-3 py-2 whitespace-nowrap text-slate-900"
                          >
                            {value === null || value === undefined ? (
                              <span className="text-slate-400 italic">null</span>
                            ) : (
                              String(value)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No data to display</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
