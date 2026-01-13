// app/insights/new/components/ClarificationPanel.tsx
// Clarification Panel Component for Adaptive Query Resolution (Phase 7D)
// Handles ambiguous questions by presenting structured clarification options to users

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ClarificationRequest, ClarificationOption } from "@/lib/prompts/generate-query.prompt";

interface ClarificationPanelProps {
  question: string;
  clarifications: ClarificationRequest[];
  reasoning: string;
  onSubmit: (clarifications: Record<string, string>) => void;
  isSubmitting?: boolean;
}

export function ClarificationPanel({
  question,
  clarifications,
  reasoning,
  onSubmit,
  isSubmitting = false,
}: ClarificationPanelProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const defaults: Record<string, string> = {};
    clarifications.forEach((clarification) => {
      const defaultOption = clarification.options.find((opt) => opt.isDefault);
      if (defaultOption) {
        defaults[clarification.id] = defaultOption.sqlConstraint;
      }
    });
    setSelections(defaults);
    setCustomValues({});
    setCustomMode({});
  }, [clarifications]);

  const handleOptionSelect = (clarificationId: string, sqlConstraint: string) => {
    setSelections((prev) => ({
      ...prev,
      [clarificationId]: sqlConstraint,
    }));
    setCustomMode((prev) => ({
      ...prev,
      [clarificationId]: false,
    }));
  };

  const handleCustomToggle = (clarificationId: string) => {
    setCustomMode((prev) => {
      const isCustom = !prev[clarificationId];
      if (isCustom) {
        // Switch to custom mode - use custom value if available
        const customVal = customValues[clarificationId];
        if (customVal) {
          setSelections((prevSelections) => ({
            ...prevSelections,
            [clarificationId]: customVal,
          }));
        }
      }
      return {
        ...prev,
        [clarificationId]: isCustom,
      };
    });
  };

  const handleCustomValueChange = (clarificationId: string, value: string) => {
    setCustomValues((prev) => ({
      ...prev,
      [clarificationId]: value,
    }));
    setSelections((prev) => ({
      ...prev,
      [clarificationId]: value,
    }));
  };

  const handleSubmit = () => {
    onSubmit(selections);
  };

  const allClarificationsAnswered = clarifications.every(
    (c) => selections[c.id] && selections[c.id].trim() !== ""
  );

  return (
    <div className="bg-white border rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 p-6 border-b bg-amber-50">
        <HelpCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 mb-1">
            I need some clarification
          </h3>
          <p className="text-sm text-slate-700 mb-2">
            Your question: <span className="font-medium">&quot;{question}&quot;</span>
          </p>
          <p className="text-sm text-slate-600">{reasoning}</p>
        </div>
      </div>

      {/* Clarification Requests */}
      <div className="p-6 space-y-6">
        {clarifications.map((clarification, index) => (
          <div key={clarification.id} className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                {index + 1}
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-1">
                  {clarification.question}
                </h4>
                <p className="text-sm text-slate-600 mb-3">
                  Ambiguous term: <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    &quot;{clarification.ambiguousTerm}&quot;
                  </span>
                </p>

                {/* Options */}
                <div className="space-y-2">
                  {clarification.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() =>
                        handleOptionSelect(clarification.id, option.sqlConstraint)
                      }
                      disabled={isSubmitting}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selections[clarification.id] === option.sqlConstraint &&
                        !customMode[clarification.id]
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      } ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {selections[clarification.id] === option.sqlConstraint &&
                          !customMode[clarification.id] ? (
                            <CheckCircle2 className="h-5 w-5 text-blue-600" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">
                              {option.label}
                            </span>
                            {option.isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                                Recommended
                              </span>
                            )}
                          </div>
                          {option.description && (
                            <p className="text-sm text-slate-600 mb-2">
                              {option.description}
                            </p>
                          )}
                          <code className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded font-mono">
                            {option.sqlConstraint}
                          </code>
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Custom Option */}
                  {clarification.allowCustom && (
                    <div className="pt-2">
                      <button
                        onClick={() => handleCustomToggle(clarification.id)}
                        disabled={isSubmitting}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          customMode[clarification.id]
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        } ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {customMode[clarification.id] ? (
                              <CheckCircle2 className="h-5 w-5 text-blue-600" />
                            ) : (
                              <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                            )}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-slate-900">
                              Custom constraint
                            </span>
                            <p className="text-sm text-slate-600 mb-2">
                              Specify your own SQL constraint
                            </p>
                          </div>
                        </div>
                      </button>

                      {customMode[clarification.id] && (
                        <div className="mt-2 ml-8">
                          <input
                            type="text"
                            value={customValues[clarification.id] || ""}
                            onChange={(e) =>
                              handleCustomValueChange(clarification.id, e.target.value)
                            }
                            disabled={isSubmitting}
                            placeholder="e.g., area > 15 AND area < 30"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoComplete="off"
                            data-form-type="other"
                            data-1p-ignore
                            data-lpignore="true"
                            spellCheck={false}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-6 border-t bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <AlertTriangle className="h-4 w-4" />
          <span>
            {allClarificationsAnswered
              ? "Ready to proceed"
              : "Please answer all clarifications"}
          </span>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!allClarificationsAnswered || isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Generating SQL...
            </>
          ) : (
            "Continue with my selections"
          )}
        </Button>
      </div>
    </div>
  );
}
