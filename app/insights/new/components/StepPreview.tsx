// app/insights/new/components/StepPreview.tsx
// Step Preview Component for Phase 7C Task 10
// Shows decomposed funnel steps before execution for complex queries

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Eye, Play, Code } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FunnelStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  tables: string[];
  estimatedRows: number;
  dependsOn?: string[]; // IDs of steps this depends on
  sql?: string; // Optional pre-generated SQL
}

interface StepPreviewProps {
  steps: FunnelStep[];
  complexityScore: number;
  onApprove: () => void;
  onInspect: () => void;
  onStepThrough: () => void;
  onModifyStep?: (stepId: string, newSql: string) => void;
}

export function StepPreview({
  steps,
  complexityScore,
  onApprove,
  onInspect,
  onStepThrough,
  onModifyStep,
}: StepPreviewProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [sqlPreviewStep, setSqlPreviewStep] = useState<FunnelStep | null>(null);

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const totalEstimatedTime = Math.ceil(steps.length * 2.5); // Rough estimate: 2.5s per step

  return (
    <div className="border rounded-lg bg-amber-50 border-amber-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-amber-900">
            ⚠️ Complex Query Detected
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            This query has a complexity score of {complexityScore}/10. I'll break it
            down into {steps.length} steps for better control and transparency.
          </p>
        </div>
        <div className="text-right text-sm text-amber-700">
          <div>Est. time: ~{totalEstimatedTime}s</div>
        </div>
      </div>

      {/* Step Cards */}
      <div className="space-y-2">
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            isExpanded={expandedSteps.has(step.id)}
            onToggle={() => toggleStep(step.id)}
            onPreviewSql={() => setSqlPreviewStep(step)}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-amber-200">
        <Button onClick={onApprove} className="flex-1" size="sm">
          <Play className="mr-2 h-4 w-4" />
          Run All Steps
        </Button>
        <Button
          onClick={onInspect}
          variant="outline"
          className="flex-1"
          size="sm"
        >
          <Eye className="mr-2 h-4 w-4" />
          Inspect Each Step
        </Button>
        <Button
          onClick={onStepThrough}
          variant="outline"
          className="flex-1"
          size="sm"
        >
          👣 Step Through Manually
        </Button>
      </div>

      {/* SQL Preview Modal */}
      {sqlPreviewStep && (
        <SqlPreviewDialog
          step={sqlPreviewStep}
          onClose={() => setSqlPreviewStep(null)}
          onModify={
            onModifyStep
              ? (sql) => {
                  onModifyStep(sqlPreviewStep.id, sql);
                  setSqlPreviewStep(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface StepCardProps {
  step: FunnelStep;
  isExpanded: boolean;
  onToggle: () => void;
  onPreviewSql: () => void;
}

function StepCard({ step, isExpanded, onToggle, onPreviewSql }: StepCardProps) {
  return (
    <div className="border border-amber-300 rounded-md bg-white">
      {/* Collapsed Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-amber-600" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-600" />
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">
              Step {step.stepNumber}
            </span>
            <span className="font-medium text-gray-900">{step.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>~{step.estimatedRows} rows</span>
          {step.dependsOn && step.dependsOn.length > 0 && (
            <span className="text-xs text-amber-600">
              Depends on Step {step.dependsOn.map((id) => id.replace("step_", "")).join(", ")}
            </span>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-amber-100 space-y-3">
          <p className="text-sm text-gray-600">{step.description}</p>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div>
              <span className="font-medium">Tables:</span>{" "}
              {step.tables.join(", ")}
            </div>
            {step.dependsOn && step.dependsOn.length > 0 && (
              <div>
                <span className="font-medium">Requires:</span> Step{" "}
                {step.dependsOn.map((id) => id.replace("step_", "")).join(", ")}{" "}
                results
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onPreviewSql}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <Code className="mr-1 h-3 w-3" />
              Preview SQL
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SqlPreviewDialogProps {
  step: FunnelStep;
  onClose: () => void;
  onModify?: (sql: string) => void;
}

function SqlPreviewDialog({ step, onClose, onModify }: SqlPreviewDialogProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedSql, setEditedSql] = useState(step.sql || "");

  const handleSave = () => {
    if (onModify) {
      onModify(editedSql);
    }
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Step {step.stepNumber}: {step.title}
          </DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* SQL Display/Edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">SQL Query</label>
              {onModify && !editMode && (
                <Button
                  onClick={() => setEditMode(true)}
                  variant="outline"
                  size="sm"
                >
                  Edit SQL
                </Button>
              )}
            </div>

            {editMode ? (
              <textarea
                value={editedSql}
                onChange={(e) => setEditedSql(e.target.value)}
                className="w-full h-48 p-3 font-mono text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <pre className="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm border">
                <code>{step.sql || "SQL not yet generated"}</code>
              </pre>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Tables:</span>{" "}
              {step.tables.join(", ")}
            </div>
            <div>
              <span className="font-medium">Estimated rows:</span>{" "}
              ~{step.estimatedRows}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            {editMode ? (
              <>
                <Button onClick={() => setEditMode(false)} variant="outline">
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save Changes</Button>
              </>
            ) : (
              <Button onClick={onClose}>Close</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
