"use client";

import { useState, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";
import type {
  FieldResolution,
  UnmatchedTerm,
  AmbiguousTerm,
} from "@/lib/services/data-gen/field-resolver.service";

interface FieldResolutionDialogueProps {
  resolution: FieldResolution;
  schema: FieldSchema[];
  onProceed: (resolvedColumns: string[]) => void;
  onFix: () => void;
}

function displayNameToColumn(
  displayName: string,
  schema: FieldSchema[]
): string | null {
  const fieldNameCounts = new Map<string, number>();
  for (const f of schema) {
    const k = f.fieldName.trim();
    fieldNameCounts.set(k, (fieldNameCounts.get(k) ?? 0) + 1);
  }
  for (const f of schema) {
    const expected =
      (fieldNameCounts.get(f.fieldName.trim()) ?? 0) > 1 && f.patientNoteName
        ? `${f.fieldName} [${f.patientNoteName}]`
        : f.fieldName;
    if (expected === displayName) return f.columnName;
  }
  return null;
}

export function FieldResolutionDialogue({
  resolution,
  schema,
  onProceed,
  onFix,
}: FieldResolutionDialogueProps) {
  const [unmatchedSelections, setUnmatchedSelections] = useState<
    Record<number, string>
  >({});
  const [ambiguousSelections, setAmbiguousSelections] = useState<
    Record<number, string>
  >({});

  const resolvedColumns = useMemo(() => {
    const cols = new Set(resolution.matched.map((m) => m.columnName));
    resolution.unmatched.forEach((u, i) => {
      const sel = unmatchedSelections[i];
      if (sel && sel !== "__ignore__") {
        const col = displayNameToColumn(sel, schema);
        if (col) cols.add(col);
      }
    });
    resolution.ambiguous.forEach((a, i) => {
      const sel = ambiguousSelections[i];
      if (sel) {
        const col = displayNameToColumn(sel, schema);
        if (col) cols.add(col);
      }
    });
    return [...cols];
  }, [
    resolution.matched,
    resolution.unmatched,
    resolution.ambiguous,
    unmatchedSelections,
    ambiguousSelections,
    schema,
  ]);

  const canProceed =
    resolution.ambiguous.every((_, i) => ambiguousSelections[i]) ||
    resolution.ambiguous.length === 0;

  const handleProceed = () => {
    if (!canProceed) return;
    onProceed(resolvedColumns);
  };

  const hasUnmatched = resolution.unmatched.length > 0;
  const hasAmbiguous = resolution.ambiguous.length > 0;
  const hasOutOfScope = resolution.outOfScope.length > 0;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">Field resolution needs your input</h4>

      {hasUnmatched && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Unknown fields</Label>
          <p className="text-muted-foreground text-xs">
            These terms were not found. Pick a suggestion or ignore.
          </p>
          <div className="space-y-2">
            {resolution.unmatched.map((u: UnmatchedTerm, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm">"{u.userTerm}"</span>
                <Select
                  value={unmatchedSelections[i] ?? "__ignore__"}
                  onValueChange={(v) =>
                    setUnmatchedSelections((prev) => ({ ...prev, [i]: v }))
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Ignore" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ignore__">Ignore</SelectItem>
                    {u.suggestions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasAmbiguous && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Ambiguous fields</Label>
          <p className="text-muted-foreground text-xs">
            Pick which field you mean.
          </p>
          <div className="space-y-3">
            {resolution.ambiguous.map((a: AmbiguousTerm, i: number) => (
              <div key={i} className="space-y-1">
                <span className="text-sm">"{a.userTerm}"</span>
                <RadioGroup
                  value={ambiguousSelections[i] ?? ""}
                  onValueChange={(v) =>
                    setAmbiguousSelections((prev) => ({ ...prev, [i]: v }))
                  }
                  className="flex flex-col gap-1"
                >
                  {a.candidates.map((c) => (
                    <div
                      key={c}
                      className="flex items-center space-x-2"
                    >
                      <RadioGroupItem value={c} id={`amb-${i}-${c}`} />
                      <Label
                        htmlFor={`amb-${i}-${c}`}
                        className="font-normal cursor-pointer"
                      >
                        {c}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOutOfScope && (
        <Alert>
          <AlertTitle>Out of scope</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              {resolution.outOfScope.map((o, i) => (
                <li key={i}>
                  "{o.userTerm}" — {o.reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              This step generates patient data only. Wound and assessment fields
              are not available here.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleProceed} disabled={!canProceed}>
          Proceed with resolved fields
        </Button>
        <Button variant="outline" onClick={onFix}>
          Fix and re-interpret
        </Button>
      </div>
    </div>
  );
}
