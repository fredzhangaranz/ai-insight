// app/insights/new/components/InsightResults.tsx

"use client";

import { useState } from "react";
import { ThinkingStream, ThinkingStep } from "./ThinkingStream";
import { ActionsPanel } from "./ActionsPanel";
import { StepPreview } from "./StepPreview";
import { ConversationalRefinement } from "./ConversationalRefinement";
import { InspectionPanel } from "./InspectionPanel";
import { InsightResult } from "@/lib/hooks/useInsights";

interface InsightResultsProps {
  result: InsightResult;
  customerId: string;
  onRefine: (question: string) => void;
  onRerun?: (newSql: string, newQuestion: string) => void;
}

export function InsightResults({
  result,
  customerId,
  onRefine,
  onRerun
}: InsightResultsProps) {
  const [stepPreviewApproved, setStepPreviewApproved] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");

  // Handle step preview approval
  const handleApprove = () => {
    setStepPreviewApproved(true);
    // TODO: Actually execute the funnel steps
    console.log("Executing all steps...");
  };

  const handleInspect = () => {
    setStepPreviewApproved(true);
    // TODO: Show inspection mode
    console.log("Inspect mode...");
  };

  const handleStepThrough = () => {
    setStepPreviewApproved(true);
    // TODO: Show step-through mode
    console.log("Step-through mode...");
  };

  const handleChallengeAssumption = (assumption: string, explanation: string) => {
    // When user challenges an assumption, pre-fill the refinement input
    // This integrates Task 12 (Inspection Panel) with Task 11 (Conversational Refinement)
    setRefinementInput(`I disagree with using "${assumption}". ${explanation}`);
  };

  return (
    <div className="space-y-6">
      <ThinkingStream steps={result.thinking} />

      {result.mode === "template" && result.template && (
        <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
          📋 Used template: <strong>{result.template}</strong>
        </div>
      )}

      {/* Show Step Preview for complex queries that require inspection */}
      {result.requiresPreview && result.stepPreview && !stepPreviewApproved && (
        <StepPreview
          steps={result.stepPreview}
          complexityScore={result.complexityScore || 8}
          onApprove={handleApprove}
          onInspect={handleInspect}
          onStepThrough={handleStepThrough}
        />
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

        {/* Inspection Panel - Show how the AI arrived at this answer */}
        <InspectionPanel
          result={result}
          onChallengeAssumption={handleChallengeAssumption}
        />

        {/* Conversational Refinement - Allow users to refine query through chat */}
        {onRerun && (
          <ConversationalRefinement
            result={result}
            customerId={customerId}
            onRerun={onRerun}
            initialInput={refinementInput}
          />
        )}
      </div>

      {/* Actions Panel - Save, Export, etc. */}
      <ActionsPanel
        result={result}
        customerId={customerId}
        onRefine={onRefine}
      />
    </div>
  );
}
