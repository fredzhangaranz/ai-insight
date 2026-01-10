// app/insights/new/components/ClarificationDialog.tsx
// Enhanced Clarification Dialog (Task 4.5F) - Surfaces template and placeholder context
// Uses rich clarification data from Tasks 4.5A-4.5E
// Extended with audit logging (Task P0.1) - Tracks clarification presentation and responses

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, AlertTriangle, Zap, HelpCircle } from "lucide-react";
import type { ClarificationRequest, ConfirmationPrompt } from "@/lib/services/semantic/template-placeholder.service";

// Internal normalized type for this component
interface NormalizedClarification {
  placeholder: string;
  prompt: string;
  examples?: string[];
  options?: string[];
  templateName?: string;
  templateSummary?: string;
  reason?: string;
  semantic?: string;
  freeformAllowed?: {
    allowed: boolean;
    placeholder?: string;
    hint?: string;
    minChars?: number;
    maxChars?: number;
  };
}

interface ClarificationDialogProps {
  question: string;
  clarifications: ClarificationRequest[] | any[];  // Accept both formats
  confirmations?: ConfirmationPrompt[];
  onSubmit: (responses: Record<string, string>) => void;
  onConfirm?: (confirmations: Record<string, boolean>) => void;
  isSubmitting?: boolean;
}

/**
 * Converts old format clarifications (with sqlConstraint) to new format
 * Old format: { id, ambiguousTerm, question, options: [{id, label, sqlConstraint}], allowCustom }
 * New format: { placeholder, prompt, options: [strings], freeformAllowed: {...} }
 */
function normalizeClarifications(clarifications: any[]): NormalizedClarification[] {
  return clarifications.map((clarification) => {
    // Check if this is old format (has ambiguousTerm or sqlConstraint in options)
    const isOldFormat =
      clarification.ambiguousTerm ||
      (clarification.options?.[0]?.sqlConstraint !== undefined);

    if (isOldFormat) {
      // Convert old format to new format
      const convertedOptions = (clarification.options || [])
        .map((opt: any) => opt.label || opt.description || opt.sqlConstraint)
        .filter(Boolean); // Remove empty options

      return {
        placeholder: clarification.id || clarification.ambiguousTerm || "unknown",
        prompt: clarification.question || `Please clarify: ${clarification.ambiguousTerm}`,
        options: convertedOptions.length > 0 ? convertedOptions : undefined,
        // Only allow freeform if: no options exist OR allowCustom is explicitly true
        freeformAllowed:
          convertedOptions.length === 0 || clarification.allowCustom
            ? {
                allowed: true,
                placeholder: "Please describe what you meant...",
                hint:
                  convertedOptions.length === 0
                    ? "Please provide your input"
                    : "Or describe something custom",
                maxChars: 500,
              }
            : undefined,
      };
    }

    // Already in new format, return as-is
    return clarification as NormalizedClarification;
  });
}

export function ClarificationDialog({
  question,
  clarifications,
  confirmations,
  onSubmit,
  onConfirm,
  isSubmitting = false,
}: ClarificationDialogProps) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [confirmedValues, setConfirmedValues] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"confirmation" | "clarification">(
    confirmations && confirmations.length > 0 ? "confirmation" : "clarification"
  );
  
  // Track presentation time for audit logging (Task P0.1)
  const presentedAtRef = useRef<Date>(new Date());
  const hasLoggedPresentationRef = useRef<boolean>(false);

  // Normalize clarifications to handle both old and new formats
  // Use useMemo to prevent recalculating on every render, which was resetting responses
  const normalizedClarifications = useMemo(
    () => normalizeClarifications(clarifications),
    [clarifications]
  );

  // Initialize with default responses
  useEffect(() => {
    const defaults: Record<string, string> = {};
    normalizedClarifications.forEach((clarification) => {
      if (clarification.options && clarification.options.length > 0) {
        // Only set first option as default if there are actual options
        defaults[clarification.placeholder] = clarification.options[0];
      } else if (clarification.freeformAllowed?.allowed) {
        // If no options but freeform is allowed, initialize with empty string
        defaults[clarification.placeholder] = "";
      }
    });
    setResponses(defaults);
  }, [normalizedClarifications]);
  
  // Log clarification presentation (Task P0.1)
  // Fire-and-forget: don't block UI on logging failure
  useEffect(() => {
    if (hasLoggedPresentationRef.current) return;
    hasLoggedPresentationRef.current = true;
    
    // Log presentation asynchronously (fire-and-forget)
    const logClarificationPresentation = async () => {
      try {
        const clarificationLogs = normalizedClarifications.map((clarification) => ({
          placeholderSemantic: clarification.semantic || clarification.placeholder,
          promptText: clarification.prompt,
          optionsPresented: clarification.options || [],
          responseType: 'abandoned', // Default to abandoned, will update on submit
          templateName: clarification.templateName,
          templateSummary: clarification.templateSummary,
          presentedAt: presentedAtRef.current.toISOString(),
        }));
        
        // Fire-and-forget API call
        fetch('/api/admin/audit/clarifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clarifications: clarificationLogs }),
        }).catch((err) => {
          console.warn('[ClarificationDialog] Failed to log presentation (non-blocking):', err);
        });
      } catch (error) {
        console.warn('[ClarificationDialog] Error preparing clarification logs:', error);
      }
    };
    
    logClarificationPresentation();
  }, [normalizedClarifications]);

  const handleConfirmationYes = () => {
    if (confirmations) {
      const confirmed: Record<string, boolean> = {};
      confirmations.forEach((conf) => {
        confirmed[conf.placeholder] = true;
      });
      setConfirmedValues(confirmed);
      onConfirm?.(confirmed);
    }
    setStep("clarification");
  };

  const handleConfirmationChange = (placeholder: string) => {
    setConfirmedValues((prev) => ({
      ...prev,
      [placeholder]: !prev[placeholder],
    }));
  };

  const handleResponseChange = (placeholder: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [placeholder]: value,
    }));
  };

  const handleOptionSelect = (placeholder: string, option: string) => {
    setResponses((prev) => ({
      ...prev,
      [placeholder]: option,
    }));
  };

  const handleSubmit = () => {
    // Log clarification responses (Task P0.1)
    // Fire-and-forget: don't block submission
    const logClarificationResponses = async () => {
      try {
        const respondedAt = new Date();
        const timeSpentMs = respondedAt.getTime() - presentedAtRef.current.getTime();
        
        const clarificationLogs = normalizedClarifications.map((clarification) => {
          const userResponse = responses[clarification.placeholder];
          const isAccepted = clarification.options?.includes(userResponse);
          
          return {
            placeholderSemantic: clarification.semantic || clarification.placeholder,
            promptText: clarification.prompt,
            optionsPresented: clarification.options || [],
            responseType: isAccepted ? 'accepted' : 'custom',
            acceptedValue: userResponse,
            timeSpentMs,
            presentedAt: presentedAtRef.current.toISOString(),
            respondedAt: respondedAt.toISOString(),
            templateName: clarification.templateName,
            templateSummary: clarification.templateSummary,
          };
        });
        
        // Fire-and-forget API call
        fetch('/api/admin/audit/clarifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clarifications: clarificationLogs }),
        }).catch((err) => {
          console.warn('[ClarificationDialog] Failed to log responses (non-blocking):', err);
        });
      } catch (error) {
        console.warn('[ClarificationDialog] Error logging clarification responses:', error);
      }
    };
    
    // Log asynchronously (don't await)
    logClarificationResponses();
    
    // Proceed with submission
    onSubmit(responses);
  };

  const allAnswered = normalizedClarifications.every(
    (c) => responses[c.placeholder] && responses[c.placeholder].trim() !== ""
  );

  // Render confirmation step first if present
  if (step === "confirmation" && confirmations && confirmations.length > 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-2xl bg-white">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b p-6">
            <div className="flex items-start gap-3">
              <Zap className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-slate-900 text-lg mb-1">
                  Quick confirmation needed
                </h2>
                <p className="text-sm text-slate-600">
                  I detected these values from your question. Approve them to proceed faster.
                </p>
              </div>
            </div>
          </div>

          {/* Confirmations */}
          <div className="p-6 space-y-4">
            {confirmations.map((confirmation) => (
              <div
                key={confirmation.placeholder}
                className="border-2 border-green-100 rounded-lg p-4 bg-green-50/50 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-mono text-sm text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                        {confirmation.placeholder}
                      </span>
                      {confirmation.semantic && (
                        <Badge variant="outline" className="text-xs">
                          {confirmation.semantic}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 font-medium mb-2">
                      {confirmation.displayLabel}
                    </p>
                    {confirmation.originalInput && (
                      <p className="text-xs text-slate-500">
                        From: <span className="italic">{confirmation.originalInput}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t p-6 flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setStep("clarification")}
              disabled={isSubmitting}
            >
              Change
            </Button>
            <Button
              onClick={handleConfirmationYes}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? "Processing..." : "Use these values"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Render clarification step
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b p-6 sticky top-0">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold text-slate-900 text-lg mb-1">
                I need some clarification
              </h2>
              <p className="text-sm text-slate-600 mb-2">
                Your question: <span className="font-medium italic">&quot;{question}&quot;</span>
              </p>
            </div>
          </div>
        </div>

        {/* Clarifications */}
        <div className="p-6 space-y-6">
          {normalizedClarifications.map((clarification, index) => (
            <ClarificationItem
              key={clarification.placeholder}
              clarification={clarification}
              index={index}
              value={responses[clarification.placeholder] || ""}
              onOptionSelect={(option) => handleOptionSelect(clarification.placeholder, option)}
              onTextChange={(value) => handleResponseChange(clarification.placeholder, value)}
              isSubmitting={isSubmitting}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-slate-50 sticky bottom-0 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            {allAnswered ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Ready to proceed</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Please answer all clarifications</span>
              </>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? "Processing..." : "Continue with my answers"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface ClarificationItemProps {
  clarification: NormalizedClarification;
  index: number;
  value: string;
  onOptionSelect: (option: string) => void;
  onTextChange: (value: string) => void;
  isSubmitting: boolean;
}

function ClarificationItem({
  clarification,
  index,
  value,
  onOptionSelect,
  onTextChange,
  isSubmitting,
}: ClarificationItemProps) {
  return (
    <div className="space-y-4">
      {/* Template Context */}
      {(clarification.templateName || clarification.reason) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
          <HelpCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            {clarification.templateName && (
              <p className="text-blue-900 font-medium">
                Using <span className="font-semibold">{clarification.templateName}</span> template
              </p>
            )}
            {clarification.reason && (
              <p className="text-blue-700 text-xs mt-1">
                {clarification.reason}
              </p>
            )}
            {clarification.templateSummary && (
              <p className="text-blue-700 text-xs mt-1">
                {clarification.templateSummary}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
          {index + 1}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-slate-900">{clarification.prompt}</h3>
            {clarification.semantic && (
              <Badge variant="secondary" className="text-xs">
                {clarification.semantic}
              </Badge>
            )}
          </div>

          {/* Predefined Options */}
          {clarification.options && clarification.options.length > 0 ? (
            <div className="space-y-2">
              {clarification.options.map((option) => (
                <button
                  key={option}
                  onClick={() => onOptionSelect(option)}
                  disabled={isSubmitting}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    value === option
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  } ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {value === option ? (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                      )}
                    </div>
                    <span className="font-medium text-slate-900">{option}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {/* Natural Language Fallback */}
          {clarification.freeformAllowed?.allowed && (!clarification.options || clarification.options.length === 0) && (
            <div className="mt-3">
              {clarification.freeformAllowed.hint && (
                <p className="text-xs text-slate-600 mb-2">{clarification.freeformAllowed.hint}</p>
              )}
              <Textarea
                value={value}
                onChange={(e) => onTextChange(e.target.value)}
                disabled={isSubmitting}
                placeholder={
                  clarification.freeformAllowed.placeholder || "Please describe what you meant..."
                }
                className="w-full min-h-24 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                {value.length}/{clarification.freeformAllowed.maxChars || 500} characters
              </p>
            </div>
          )}

          {/* Examples */}
          {clarification.examples && clarification.examples.length > 0 && (
            <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
              <span className="font-medium">Examples:</span> {clarification.examples.join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

