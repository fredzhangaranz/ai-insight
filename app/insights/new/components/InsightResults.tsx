// app/insights/new/components/InsightResults.tsx

"use client";

import { ThinkingStream, ThinkingStep } from "./ThinkingStream";
import { InsightResult } from "@/lib/hooks/useInsights";

interface InsightResultsProps {
  result: InsightResult;
  customerId: string;
  onRefine: (question: string) => void;
}

export function InsightResults({
  result,
  customerId,
  onRefine
}: InsightResultsProps) {
  return (
    <div className="space-y-6">
      <ThinkingStream steps={result.thinking} />

      {result.mode === "template" && result.template && (
        <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
          📋 Used template: <strong>{result.template}</strong>
        </div>
      )}

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Results ({result.results?.rows.length || 0} records)
          </h3>
        </div>

        {/* Simple table display */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {result.results?.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {result.results?.rows.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  {result.results.columns.map((col) => (
                    <td key={col} className="px-4 py-3 text-sm text-gray-900">
                      {row[col] !== null && row[col] !== undefined
                        ? String(row[col])
                        : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.results && result.results.rows.length > 10 && (
            <div className="text-sm text-gray-500 mt-4 text-center">
              Showing first 10 of {result.results.rows.length} rows
            </div>
          )}
        </div>
      </div>

      {/* Placeholder for actions - will be implemented in Phase 7D */}
      <div className="bg-gray-50 rounded-lg border p-4">
        <p className="text-sm text-gray-600">
          Actions panel (Chart, Save, Export) will be available in Phase 7D
        </p>
      </div>
    </div>
  );
}
