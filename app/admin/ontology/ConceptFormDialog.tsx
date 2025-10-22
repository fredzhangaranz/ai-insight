"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { parseAliases, parseMetadata, stringifyAliases } from "./helpers";
import {
  ConceptFormSubmitPayload,
  OntologyConcept,
} from "./types";

type ConceptFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ConceptFormSubmitPayload) => Promise<void>;
  isSubmitting?: boolean;
  conceptTypes: string[];
  initialConcept?: OntologyConcept | null;
};

type FormState = {
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  description: string;
  aliasText: string;
  metadataText: string;
  isDeprecated: boolean;
};

const EMPTY_FORM: FormState = {
  conceptName: "",
  canonicalName: "",
  conceptType: "",
  description: "",
  aliasText: "",
  metadataText: "{}",
  isDeprecated: false,
};

function toMetadataString(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "{}";
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return "{}";
  }
}

export function ConceptFormDialog({
  open,
  mode,
  onOpenChange,
  onSubmit,
  conceptTypes,
  initialConcept = null,
  isSubmitting = false,
}: ConceptFormDialogProps) {
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isCustomType, setIsCustomType] = useState(false);

  const allConceptTypes = useMemo(() => {
    const base = conceptTypes?.filter((value) => value && value.trim().length);
    return Array.from(new Set(base));
  }, [conceptTypes]);

  useEffect(() => {
    if (!open) {
      setFormState(EMPTY_FORM);
      setSubmitError(null);
      setMetadataError(null);
      setIsCustomType(false);
      return;
    }

    if (mode === "edit" && initialConcept) {
      const aliasText = stringifyAliases(initialConcept.aliases);
      const metadataText = toMetadataString(initialConcept.metadata);
      const conceptType = initialConcept.conceptType || "";
      const customType =
        conceptType.length > 0 && !allConceptTypes.includes(conceptType);

      setFormState({
        conceptName: initialConcept.conceptName,
        canonicalName: initialConcept.canonicalName,
        conceptType,
        description: initialConcept.description ?? "",
        aliasText,
        metadataText,
        isDeprecated: initialConcept.isDeprecated,
      });
      setIsCustomType(customType);
    } else {
      setFormState((prev) => ({
        ...EMPTY_FORM,
        conceptType: allConceptTypes[0] ?? "",
      }));
      setIsCustomType(false);
    }

    setSubmitError(null);
    setMetadataError(null);
  }, [open, mode, initialConcept, allConceptTypes]);

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSubmitError(null);
      setMetadataError(null);
    }
  };

  const handleConceptTypeChange = (value: string) => {
    if (value === "__custom__") {
      setIsCustomType(true);
      setFormState((state) => ({ ...state, conceptType: "" }));
      return;
    }

    setIsCustomType(false);
    setFormState((state) => ({ ...state, conceptType: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setMetadataError(null);

    const nextConceptType = formState.conceptType.trim();
    if (nextConceptType.length === 0) {
      setSubmitError("Concept type is required.");
      return;
    }

    if (formState.conceptName.trim().length === 0) {
      setSubmitError("Concept name is required.");
      return;
    }

    if (formState.canonicalName.trim().length === 0) {
      setSubmitError("Canonical name is required.");
      return;
    }

    let metadata: Record<string, unknown>;
    try {
      metadata = parseMetadata(formState.metadataText);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid metadata JSON.";
      setMetadataError(message);
      return;
    }

    const payload: ConceptFormSubmitPayload = {
      id: mode === "edit" ? initialConcept?.id : undefined,
      conceptName: formState.conceptName.trim(),
      canonicalName: formState.canonicalName.trim(),
      conceptType: nextConceptType,
      description: formState.description.trim() || null,
      aliases: parseAliases(formState.aliasText),
      metadata,
      isDeprecated:
        mode === "edit" ? Boolean(formState.isDeprecated) : undefined,
    };

    try {
      await onSubmit(payload);
      handleClose(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save concept.";
      setSubmitError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Concept" : "Edit Concept"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new ontology concept. Embedding generation runs automatically after save."
              : "Update the ontology concept metadata. Saving will regenerate embeddings if needed."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="concept-name">Concept name</Label>
              <Input
                id="concept-name"
                value={formState.conceptName}
                onChange={(event) =>
                  setFormState((state) => ({
                    ...state,
                    conceptName: event.target.value,
                  }))
                }
                placeholder="Diabetic foot ulcer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canonical-name">Canonical name</Label>
              <Input
                id="canonical-name"
                value={formState.canonicalName}
                onChange={(event) =>
                  setFormState((state) => ({
                    ...state,
                    canonicalName: event.target.value,
                  }))
                }
                placeholder="Diabetic Foot Ulcer"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label>Concept type</Label>
              <Select
                value={isCustomType ? "__custom__" : formState.conceptType}
                onValueChange={handleConceptTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {allConceptTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom type…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "edit" && (
              <div className="flex items-center justify-end space-x-2 rounded-md border border-slate-200 px-3 py-2">
                <Label htmlFor="deprecated-switch" className="text-sm">
                  Deprecated
                </Label>
                <Switch
                  id="deprecated-switch"
                  checked={formState.isDeprecated}
                  onCheckedChange={(value) =>
                    setFormState((state) => ({
                      ...state,
                      isDeprecated: value,
                    }))
                  }
                />
              </div>
            )}
          </div>

          {isCustomType && (
            <div className="space-y-2">
              <Label htmlFor="custom-concept-type">Custom type</Label>
              <Input
                id="custom-concept-type"
                value={formState.conceptType}
                onChange={(event) =>
                  setFormState((state) => ({
                    ...state,
                    conceptType: event.target.value,
                  }))
                }
                placeholder="Enter custom concept type"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formState.description}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  description: event.target.value,
                }))
              }
              placeholder="Short description to help reviewers understand the concept."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">Aliases (one per line)</Label>
            <Textarea
              id="aliases"
              value={formState.aliasText}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  aliasText: event.target.value,
                }))
              }
              placeholder={`DFU\nChronic diabetic ulcer`}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metadata">Metadata (JSON)</Label>
            <Textarea
              id="metadata"
              value={formState.metadataText}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  metadataText: event.target.value,
                }))
              }
              rows={5}
              spellCheck={false}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">
              Provide additional context such as prevalence, coding hints, or ontology IDs.
            </p>
          </div>

          {metadataError && (
            <Alert variant="destructive">
              <AlertDescription>{metadataError}</AlertDescription>
            </Alert>
          )}

          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save concept"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
