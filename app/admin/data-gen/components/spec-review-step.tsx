"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GenerationSpec, FieldSpec } from "@/lib/services/data-gen/generation-spec.types";

interface SpecReviewStepProps {
  spec: GenerationSpec;
  warnings: { fieldName: string; type: string; message: string; suggestion?: string }[];
  onApplySuggestion: (fieldName: string, suggestion: string) => void;
  onRemoveField: (fieldName: string) => void;
  onBack: () => void;
  onPreview: () => void;
}

function criteriaSummary(criteria: FieldSpec["criteria"]): string {
  if (criteria.type === "faker") return `faker: ${criteria.fakerMethod}`;
  if (criteria.type === "fixed") return `fixed: ${criteria.value}`;
  if (criteria.type === "distribution") {
    const parts = Object.entries(criteria.weights).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`);
    return parts.join(" • ");
  }
  if (criteria.type === "range") return `${criteria.min} → ${criteria.max}`;
  if (criteria.type === "options") return `pick from: ${criteria.pickFrom?.join(", ") ?? "—"}`;
  return criteria.type;
}

export function SpecReviewStep({
  spec,
  warnings,
  onApplySuggestion,
  onRemoveField,
  onBack,
  onPreview,
}: SpecReviewStepProps) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const visibleFields = spec.fields.filter((f) => !removed.has(f.fieldName));
  const warningByField = new Map(warnings.map((w) => [w.fieldName, w]));
  const hasInvalidDropdown = warnings.some((w) => w.type === "invalid_dropdown");

  const handleApply = (fieldName: string, suggestion: string) => {
    onApplySuggestion(fieldName, suggestion);
    setApplied((p) => new Set(p).add(fieldName));
  };

  const handleRemove = (fieldName: string) => {
    onRemoveField(fieldName);
    setRemoved((p) => new Set(p).add(fieldName));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Review Interpreted Spec</CardTitle>
        <CardDescription>
          Review and fix any issues before previewing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="max-h-48 min-h-24 overflow-y-auto overflow-x-hidden pr-2 block text-sm">
            Context:{" "}
            {spec.mode === "update"
              ? `Updating ${spec.count} patient(s) — only the fields below will be changed`
              : spec.entity === "patient"
              ? `Creating ${spec.count} new Patients`
              : `Generating assessments for ${spec.count} target(s)`}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {visibleFields.map((field) => {
            const w = warningByField.get(field.fieldName);
            const isInvalid = w?.type === "invalid_dropdown";
            const isAlgo = w?.type === "algorithm_output";

            return (
              <div
                key={field.fieldName}
                className={`border rounded-lg p-4 ${
                  isInvalid ? "border-destructive bg-destructive/5" : isAlgo ? "border-amber-500/50 bg-amber-50/50" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      {isInvalid && <Badge variant="destructive">Invalid</Badge>}
                      {isAlgo && <Badge variant="outline">⚠ algorithm-output</Badge>}
                      <span className="font-medium">{field.fieldName}</span>
                      <Badge variant="secondary">{field.criteria.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {criteriaSummary(field.criteria)}
                    </p>
                    {w && (
                      <p className="text-sm mt-2">{w.message}</p>
                    )}
                    {isInvalid && w?.suggestion && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => handleApply(field.fieldName, w.suggestion!)}
                      >
                        Use suggestion: &quot;{w.suggestion}&quot;
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(field.fieldName)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {hasInvalidDropdown && (
          <Alert variant="destructive">
            <AlertDescription>Fix all red issues before proceeding to preview.</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <Button onClick={onPreview} disabled={hasInvalidDropdown}>
            Preview →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
