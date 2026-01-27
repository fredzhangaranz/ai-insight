// app/insights/new/components/InsightResults.tsx

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ThinkingStream, ThinkingStep } from "./ThinkingStream";
import { ActionsPanel } from "./ActionsPanel";
import { StepPreview } from "./StepPreview";
import { ConversationalRefinement } from "./ConversationalRefinement";
import { ConversationPanel } from "./ConversationPanel";
import { InspectionPanel } from "./InspectionPanel";
import { InsightResult } from "@/lib/hooks/useInsights";

interface InsightResultsProps {
  result: InsightResult;
  customerId: string;
  modelId?: string;
  onRefine: (question: string) => void;
  onRerun?: (newSql: string, newQuestion: string) => void;
  threadId?: string; // From first question, for conversation continuity
}

export function InsightResults({
  result,
  customerId,
  modelId,
  onRefine,
  onRerun,
  threadId, // Add this prop
}: InsightResultsProps) {
  const [stepPreviewApproved, setStepPreviewApproved] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const validation = result.sqlValidation;
  const hasErrors = Boolean(validation && !validation.isValid && validation.errors.length > 0);
  const hasWarnings = Boolean(validation && validation.warnings.length > 0);
  const validationBadge = useMemo(() => {
    if (!validation) return null;
    if (hasErrors) {
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Issues detected
        </span>
      );
    }
    if (hasWarnings) {
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700">
          <Info className="h-4 w-4" />
          Warnings
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Looks good
      </span>
    );
  }, [validation, hasErrors, hasWarnings]);

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

      {validation && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            hasErrors
              ? "bg-red-50 border-red-200"
              : hasWarnings
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-slate-800">
              SQL validation {hasErrors ? "failed" : "completed"}
            </div>
            {validationBadge}
          </div>
          {hasErrors && (
            <ul className="space-y-2 text-sm text-red-800">
              {validation.errors.map((error, idx) => (
                <li key={`${error.type}-${idx}`}>
                  <div className="font-medium">{error.message}</div>
                  <div className="text-xs text-red-700 mt-1">
                    Suggestion: {error.suggestion}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!hasErrors && hasWarnings && (
            <ul className="space-y-1 text-sm text-amber-800">
              {validation.warnings.map((warning, idx) => (
                <li key={`warning-${idx}`}>• {warning}</li>
              ))}
            </ul>
          )}
          {!hasErrors && !hasWarnings && (
            <p className="text-sm text-emerald-800">
              No issues detected. Query is ready to run.
            </p>
          )}
        </div>
      )}

      {/* Show assumptions made by LLM */}
      {result.assumptions && result.assumptions.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">
                I made {result.assumptions.length} assumption{result.assumptions.length > 1 ? "s" : ""}
              </h4>
              <ul className="space-y-2">
                {result.assumptions.map((assumption: any, index: number) => (
                  <li key={index} className="text-sm text-amber-700">
                    <span className="font-medium">{assumption.term || "Unknown"}:</span>{" "}
                    <span>{assumption.assumedValue || assumption.reasoning || "No details available"}</span>
                    {assumption.confidence !== undefined && (
                      <span className="ml-2 text-xs text-amber-600">
                        (confidence: {(assumption.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                You can use the &quot;Inspection Panel&quot; below to challenge these assumptions if needed.
              </p>
            </div>
          </div>
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
                  {result.results?.columns.map((col) => (
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

        <ConversationPanel
          customerId={customerId}
          modelId={modelId}
          initialThreadId={threadId}
          initialResult={result}
        />
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
