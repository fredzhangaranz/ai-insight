"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  validateTemplate,
  type PlaceholdersSpec,
  type PlaceholdersSpecSlot,
  type ValidationResult,
} from "@/lib/services/template-validator.service";
import type { TemplateDraftPayload } from "@/lib/services/template.service";
import type { SimilarTemplateWarning } from "@/lib/services/template-similarity.service";
import {
  INTENT_METADATA,
  getAllIntentValues,
  type IntentMetadata,
} from "@/lib/config/intent-metadata";

const INTENT_OPTIONS = getAllIntentValues();

interface SlotDraft extends PlaceholdersSpecSlot {
  id: string;
  defaultText?: string;
  validatorsText?: string;
}

interface TemplateFormState {
  name: string;
  intent: string;
  description: string;
  sqlPattern: string;
  keywordsText: string;
  tagsText: string;
  examplesText: string;
  slots: SlotDraft[];
}

interface TemplateReviewModalProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  draft: TemplateDraftPayload | null;
  initialValidation?: ValidationResult | null;
  initialWarnings?: string[];
  generatingModelId?: string;
  isSaving: boolean;
  onSaveDraft: (payload: TemplateDraftPayload) => Promise<void>;
}

interface DuplicateCheckState {
  isLoading: boolean;
  similarTemplates: SimilarTemplateWarning[];
  lastCheckedFormHash: string | null;
  userDecision:
    | "none"
    | "reviewing"
    | "saved-anyway"
    | "cancelled"
    | "reviewed-existing";
}

const emptyForm: TemplateFormState = {
  name: "",
  intent: INTENT_OPTIONS[0],
  description: "",
  sqlPattern: "",
  keywordsText: "",
  tagsText: "",
  examplesText: "",
  slots: [],
};

function toFormState(draft: TemplateDraftPayload | null): TemplateFormState {
  if (!draft) return emptyForm;
  const slots: SlotDraft[] = (draft.placeholdersSpec?.slots ?? []).map(
    (slot) => ({
      ...slot,
      id: crypto.randomUUID(),
      validatorsText: (slot.validators ?? []).join(", "),
    })
  );
  return {
    name: draft.name ?? "",
    intent: draft.intent ?? INTENT_OPTIONS[0],
    description: draft.description ?? "",
    sqlPattern: draft.sqlPattern ?? "",
    keywordsText: (draft.keywords ?? []).join(", "),
    tagsText: (draft.tags ?? []).join(", "),
    examplesText: (draft.examples ?? []).join("\n"),
    slots,
  };
}

function toPayload(state: TemplateFormState): TemplateDraftPayload {
  const keywords = state.keywordsText
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const tags = state.tagsText
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const examples = state.examplesText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const slots = state.slots.map<PlaceholdersSpecSlot>((slot) => ({
    name: slot.name.trim(),
    type: slot.type?.trim() || undefined,
    semantic: slot.semantic?.trim() || undefined,
    required: slot.required !== false,
    default: slot.default,
    validators: slot.validatorsText
      ? slot.validatorsText
          .split(",")
          .map((rule) => rule.trim())
          .filter(Boolean)
      : undefined,
  }));

  const placeholdersSpec: PlaceholdersSpec | null = slots.length
    ? { slots }
    : null;

  return {
    name: state.name.trim(),
    intent: state.intent.trim(),
    description: state.description.trim() || undefined,
    sqlPattern: state.sqlPattern.trim(),
    placeholdersSpec,
    keywords,
    tags,
    examples,
  };
}

export function TemplateReviewModal({
  open,
  onOpenChange,
  draft,
  initialValidation,
  initialWarnings,
  generatingModelId,
  isSaving,
  onSaveDraft,
}: TemplateReviewModalProps) {
  const [formState, setFormState] = useState<TemplateFormState>(() =>
    toFormState(draft)
  );
  const [localWarnings, setLocalWarnings] = useState<string[]>(
    initialWarnings ?? []
  );
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckState>({
    isLoading: false,
    similarTemplates: [],
    lastCheckedFormHash: null,
    userDecision: "none",
  });

  useEffect(() => {
    if (draft) {
      setFormState(toFormState(draft));
      setLocalWarnings(initialWarnings ?? []);
      // Reset duplicate check when new draft is loaded
      setDuplicateCheck({
        isLoading: false,
        similarTemplates: [],
        lastCheckedFormHash: null,
        userDecision: "none",
      });
    }
  }, [draft, initialWarnings, open]);

  const validation = useMemo(() => {
    const payload = toPayload(formState);
    return validateTemplate({
      name: payload.name,
      sqlPattern: payload.sqlPattern,
      placeholders: payload.placeholdersSpec?.slots?.map((slot) => slot.name),
      placeholdersSpec: payload.placeholdersSpec ?? undefined,
    });
  }, [formState]);

  const errors = validation.errors;
  const warnings = validation.warnings;

  // Create a hash of form state for duplicate checking
  const formHash = useMemo(() => {
    const payload = toPayload(formState);
    const checkData = {
      name: payload.name,
      intent: payload.intent,
      description: payload.description,
      keywords: payload.keywords,
      tags: payload.tags,
    };
    return JSON.stringify(checkData);
  }, [formState]);

  // Debounced duplicate check function
  const checkForDuplicates = useCallback(
    async (payload: TemplateDraftPayload) => {
      if (!payload.name.trim() || !payload.intent.trim()) {
        return;
      }

      try {
        setDuplicateCheck((prev) => ({ ...prev, isLoading: true }));

        const response = await fetch("/api/ai/templates/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.name,
            intent: payload.intent,
            description: payload.description,
            keywords: payload.keywords,
            tags: payload.tags,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setDuplicateCheck((prev) => ({
            ...prev,
            isLoading: false,
            similarTemplates: data.similar || [],
            lastCheckedFormHash: formHash,
            userDecision: data.similar?.length > 0 ? "reviewing" : "none",
          }));
        } else if (response.status === 404) {
          // Feature flag is off, skip duplicate checking
          setDuplicateCheck((prev) => ({
            ...prev,
            isLoading: false,
            similarTemplates: [],
            lastCheckedFormHash: formHash,
            userDecision: "none",
          }));
        } else {
          console.warn(
            "Failed to check for duplicate templates:",
            response.statusText
          );
          setDuplicateCheck((prev) => ({
            ...prev,
            isLoading: false,
            similarTemplates: [],
            lastCheckedFormHash: formHash,
            userDecision: "none",
          }));
        }
      } catch (error) {
        console.error("Error checking for duplicate templates:", error);
        setDuplicateCheck((prev) => ({
          ...prev,
          isLoading: false,
          similarTemplates: [],
          lastCheckedFormHash: formHash,
          userDecision: "none",
        }));
      }
    },
    [formHash]
  );

  // Trigger duplicate check when form changes (debounced)
  useEffect(() => {
    const payload = toPayload(formState);

    // Skip if we've already checked this form state
    if (duplicateCheck.lastCheckedFormHash === formHash) {
      return;
    }

    // Skip if form is invalid or empty
    if (!payload.name.trim() || !payload.intent.trim()) {
      return;
    }

    // Debounce the check
    const timeoutId = setTimeout(() => {
      checkForDuplicates(payload);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [
    formHash,
    duplicateCheck.lastCheckedFormHash,
    checkForDuplicates,
    formState,
  ]);

  const handleSlotChange = <K extends keyof SlotDraft>(
    id: string,
    key: K,
    value: SlotDraft[K]
  ) => {
    setFormState((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) =>
        slot.id === id
          ? {
              ...slot,
              [key]: value,
            }
          : slot
      ),
    }));
  };

  const handleAddSlot = () => {
    setFormState((prev) => ({
      ...prev,
      slots: [
        ...prev.slots,
        {
          id: crypto.randomUUID(),
          name: "placeholder",
          type: "string",
          semantic: "",
          required: true,
          validatorsText: "",
        },
      ],
    }));
  };

  const handleRemoveSlot = (id: string) => {
    setFormState((prev) => ({
      ...prev,
      slots: prev.slots.filter((slot) => slot.id !== id),
    }));
  };

  const handleSave = async () => {
    const payload = toPayload(formState);

    // Log user decision for analytics
    if (duplicateCheck.similarTemplates.length > 0) {
      console.log("Template saved despite duplicates:", {
        templateName: payload.name,
        similarCount: duplicateCheck.similarTemplates.length,
        decision: "saved-anyway",
        similarTemplates: duplicateCheck.similarTemplates.map((t) => ({
          name: t.name,
          similarity: t.similarity,
          successRate: t.successRate,
        })),
      });

      setDuplicateCheck((prev) => ({ ...prev, userDecision: "saved-anyway" }));
    }

    await onSaveDraft(payload);
  };

  const handleDismissDuplicateWarning = () => {
    setDuplicateCheck((prev) => ({ ...prev, userDecision: "saved-anyway" }));
  };

  const handleViewExistingTemplate = (
    templateId: number | undefined,
    templateName: string
  ) => {
    console.log("User chose to review existing template:", {
      templateId,
      templateName,
      decision: "reviewed-existing",
    });

    setDuplicateCheck((prev) => ({
      ...prev,
      userDecision: "reviewed-existing",
    }));

    // TODO: Navigate to template detail view or open in new tab
    // For now, we'll just log the action
    alert(`Reviewing existing template: ${templateName} (ID: ${templateId})`);
  };

  const handleCancelDueToSimilarity = () => {
    console.log("User cancelled template creation due to similarity:", {
      templateName: formState.name,
      similarCount: duplicateCheck.similarTemplates.length,
      decision: "cancelled",
    });

    setDuplicateCheck((prev) => ({ ...prev, userDecision: "cancelled" }));
    onOpenChange(false);
  };

  // Determine if we should show the duplicate warning
  const showDuplicateWarning =
    duplicateCheck.similarTemplates.length > 0 &&
    duplicateCheck.userDecision === "reviewing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review AI-Extracted Template</DialogTitle>
          <DialogDescription>
            Generated{generatingModelId ? ` by ${generatingModelId}` : ""}.
            Review the draft, make adjustments, and save it as a template draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {showDuplicateWarning && (
            <div className="rounded border border-orange-200 bg-orange-50 p-4 text-orange-900">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 text-lg">⚠️</div>
                <div className="flex-1">
                  <p className="font-medium text-orange-800">
                    Similar templates detected
                  </p>
                  <p className="mt-1 text-sm text-orange-700">
                    Found {duplicateCheck.similarTemplates.length} existing
                    template
                    {duplicateCheck.similarTemplates.length === 1
                      ? ""
                      : "s"}{" "}
                    with similar content. Review before saving to avoid
                    duplicates.
                  </p>

                  <div className="mt-3 space-y-2">
                    {duplicateCheck.similarTemplates.map((similar, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded bg-orange-100 p-2 text-sm"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-orange-800">
                            {similar.name}
                          </div>
                          <div className="text-xs text-orange-600">
                            {Math.round(similar.similarity * 100)}% similar
                            {similar.successRate !== undefined && (
                              <>
                                {" "}
                                • {Math.round(similar.successRate * 100)}%
                                success rate
                              </>
                            )}
                            {similar.usageCount !== undefined &&
                              similar.usageCount > 0 && (
                                <> • {similar.usageCount} uses</>
                              )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-orange-700 hover:text-orange-800"
                          onClick={() =>
                            handleViewExistingTemplate(
                              similar.templateId,
                              similar.name
                            )
                          }
                        >
                          View
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-800 hover:bg-orange-100"
                      onClick={handleDismissDuplicateWarning}
                    >
                      Save Anyway
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-800 hover:bg-orange-100"
                      onClick={handleCancelDueToSimilarity}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {duplicateCheck.isLoading && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-blue-900">
              <div className="flex items-center gap-3">
                <div className="animate-spin text-blue-600">⟳</div>
                <span className="text-sm">
                  Checking for similar templates...
                </span>
              </div>
            </div>
          )}

          {(localWarnings.length > 0 || initialValidation?.warnings.length) && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Extraction Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {[...(initialWarnings ?? []), ...localWarnings].map(
                  (warning, idx) => (
                    <li key={idx}>{warning}</li>
                  )
                )}
              </ul>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-red-900">
              <p className="font-medium">Validation Errors</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((error, idx) => (
                  <li key={idx}>{error.message}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Validation Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((warning, idx) => (
                  <li key={idx}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Template Name
              </label>
              <Input
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Describe the template"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Query Pattern Intent
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] text-muted-foreground hover:bg-muted"
                      >
                        ?
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium">What is Intent?</p>
                      <p className="mt-1 text-xs">
                        Intent categorizes the SQL pattern type (aggregation,
                        time series, ranking, etc.) to help match templates to
                        questions. Choose the category that best describes what
                        the query does.
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        See{" "}
                        <a
                          href="/docs/template-authoring-guide.md"
                          className="underline"
                          target="_blank"
                        >
                          authoring guide
                        </a>{" "}
                        for details.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {draft?.intent &&
                  draft.intent === formState.intent &&
                  generatingModelId && (
                    <Badge variant="secondary" className="text-[10px]">
                      ✨ AI Suggested
                    </Badge>
                  )}
              </div>
              <Select
                value={formState.intent}
                onValueChange={(value) =>
                  setFormState((prev) => ({ ...prev, intent: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {formState.intent && INTENT_METADATA[formState.intent] ? (
                      <span className="flex items-center gap-2">
                        <span>{INTENT_METADATA[formState.intent].icon}</span>
                        <span>{INTENT_METADATA[formState.intent].label}</span>
                      </span>
                    ) : (
                      "Select a query pattern"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Group by category */}
                  {Object.entries(
                    INTENT_OPTIONS.reduce((acc, intentValue) => {
                      const metadata = INTENT_METADATA[intentValue];
                      if (!metadata) return acc;
                      const category = metadata.category;
                      if (!acc[category]) acc[category] = [];
                      acc[category].push(metadata);
                      return acc;
                    }, {} as Record<string, IntentMetadata[]>)
                  ).map(([category, intents]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {category}
                      </div>
                      {intents.map((metadata) => (
                        <SelectItem
                          key={metadata.value}
                          value={metadata.value}
                          className="pl-6"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-base">
                              {metadata.icon}
                            </span>
                            <div className="flex-1">
                              <div className="font-medium">
                                {metadata.label}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {metadata.description}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {/* Context-aware help text */}
              {formState.intent && INTENT_METADATA[formState.intent] && (
                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs">
                  <p className="font-medium text-blue-900">
                    {INTENT_METADATA[formState.intent].icon}{" "}
                    {INTENT_METADATA[formState.intent].label}
                  </p>
                  <p className="mt-1 text-blue-800">
                    <span className="font-medium">SQL Pattern:</span>{" "}
                    {INTENT_METADATA[formState.intent].sqlHint}
                  </p>
                  <div className="mt-2">
                    <p className="font-medium text-blue-900">
                      Example questions:
                    </p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-blue-800">
                      {INTENT_METADATA[formState.intent].examples.map(
                        (example, idx) => (
                          <li key={idx}>{example}</li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                value={formState.description}
                rows={3}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="Summarize what this template answers"
              />
            </div>
          </section>

          <section className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              SQL Pattern
            </label>
            <Textarea
              className="font-mono"
              rows={10}
              value={formState.sqlPattern}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  sqlPattern: event.target.value,
                }))
              }
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Placeholders</p>
                <p className="text-xs text-muted-foreground">
                  Map each {"{placeholder}"} in the SQL to a typed slot.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleAddSlot}>
                + Add Placeholder
              </Button>
            </div>

            {formState.slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No placeholders detected. Add one if your SQL includes dynamic
                values.
              </p>
            ) : (
              <div className="space-y-3">
                {formState.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="rounded border border-muted p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{slot.name}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {slot.required !== false ? "Required" : "Optional"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSlot(slot.id)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Name
                        </label>
                        <Input
                          value={slot.name}
                          onChange={(event) =>
                            handleSlotChange(
                              slot.id,
                              "name",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Type
                        </label>
                        <Select
                          value={slot.type || "unknown"}
                          onValueChange={(value) =>
                            handleSlotChange(
                              slot.id,
                              "type",
                              value === "unknown" ? "" : value
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unknown">
                              <em>Unknown</em>
                            </SelectItem>
                            {[
                              "guid",
                              "int",
                              "string",
                              "date",
                              "boolean",
                              "float",
                              "decimal",
                            ].map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Semantic
                        </label>
                        <Input
                          value={slot.semantic || ""}
                          onChange={(event) =>
                            handleSlotChange(
                              slot.id,
                              "semantic",
                              event.target.value
                            )
                          }
                          placeholder="patient_id"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Required
                        </label>
                        <div className="flex h-10 items-center">
                          <Switch
                            checked={slot.required !== false}
                            onCheckedChange={(value) =>
                              handleSlotChange(slot.id, "required", value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Default Value
                        </label>
                        <Input
                          value={slot.default ? String(slot.default) : ""}
                          onChange={(event) =>
                            handleSlotChange(
                              slot.id,
                              "default",
                              event.target.value
                            )
                          }
                          placeholder="GETUTCDATE()"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Validators (comma separated)
                        </label>
                        <Input
                          value={slot.validatorsText || ""}
                          onChange={(event) =>
                            handleSlotChange(
                              slot.id,
                              "validatorsText",
                              event.target.value
                            )
                          }
                          placeholder="non-empty, min:1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Keywords (comma separated)
              </label>
              <Textarea
                rows={2}
                value={formState.keywordsText}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    keywordsText: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Tags
              </label>
              <Textarea
                rows={2}
                value={formState.tagsText}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    tagsText: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">
                Example Questions (one per line)
              </label>
              <Textarea
                rows={3}
                value={formState.examplesText}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    examplesText: event.target.value,
                  }))
                }
              />
            </div>
          </section>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Validation updates automatically as you edit. Fix all errors before
            saving the draft.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || errors.length > 0 || !formState.name.trim()}
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
