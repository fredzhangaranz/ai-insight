"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";

interface FieldReferencePanelProps {
  patientFields: FieldSchema[];
  formFields?: FieldSchema[];
  formName?: string;
  className?: string;
}

const CLASS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "pure-data": { label: "●", variant: "secondary" },
  "algorithm-output": { label: "⚙", variant: "outline" },
  "source-of-truth": { label: "✗", variant: "destructive" },
};

export function FieldReferencePanel({
  patientFields,
  formFields = [],
  formName,
  className,
}: FieldReferencePanelProps) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const patientDisplayLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of patientFields) {
      const k = f.fieldName.trim();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Map(
      patientFields.map((f) => {
        const label =
          (counts.get(f.fieldName.trim()) ?? 0) > 1 && f.patientNoteName
            ? `${f.fieldName} [${f.patientNoteName}]`
            : f.fieldName;
        return [f.columnName, label] as const;
      })
    );
  }, [patientFields]);

  const filteredPatient = useMemo(() => {
    if (!filter.trim()) return patientFields;
    const q = filter.toLowerCase();
    return patientFields.filter(
      (f) =>
        f.fieldName.toLowerCase().includes(q) ||
        f.columnName.toLowerCase().includes(q) ||
        (f.patientNoteName?.toLowerCase().includes(q) ?? false)
    );
  }, [patientFields, filter]);

  const filteredForm = useMemo(() => {
    if (!filter.trim()) return formFields;
    const q = filter.toLowerCase();
    return formFields.filter(
      (f) =>
        f.fieldName.toLowerCase().includes(q) ||
        f.columnName.toLowerCase().includes(q)
    );
  }, [formFields, filter]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderField = (
    f: FieldSchema,
    prefix: string,
    opts?: { displayLabel?: string; storageBadge?: string }
  ) => {
    const key = `${prefix}-${f.columnName}`;
    const hasOptions = f.options && f.options.length > 0;
    const isExpanded = expanded.has(key);
    const fc = f.fieldClass ?? "pure-data";
    const { label, variant } = CLASS_LABELS[fc] ?? CLASS_LABELS["pure-data"];
    const displayName = opts?.displayLabel ?? f.fieldName;

    const badges = (
      <>
        <Badge variant="outline" className="text-xs font-normal">
          {f.dataType}
        </Badge>
        {opts?.storageBadge && (
          <Badge variant="secondary" className="text-xs font-normal">
            {opts.storageBadge}
          </Badge>
        )}
        <Badge variant={variant} className="text-xs">
          {label}
        </Badge>
        {f.coverage != null && (
          <span className="text-muted-foreground text-xs">
            {Math.round(f.coverage.coveragePct)}%
          </span>
        )}
      </>
    );

    if (!hasOptions) {
      return (
        <div key={key} className="flex items-center gap-2 py-1 text-sm">
          <span className="w-3" />
          <span className="font-medium">{displayName}</span>
          {badges}
        </div>
      );
    }

    return (
      <Collapsible key={key} open={isExpanded} onOpenChange={() => toggleExpand(key)}>
        <div className="flex items-center gap-2 py-1 text-sm">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 hover:bg-muted rounded px-1 -ml-1">
              {isExpanded ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
            </button>
          </CollapsibleTrigger>
          <span className="font-medium">{displayName}</span>
          {badges}
        </div>
        <CollapsibleContent>
          <div className="pl-5 pb-2 text-xs text-muted-foreground">
            {f.options!.map((opt) => (
              <div key={opt}>↳ {opt}</div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className={className}>
      <div className="relative mb-3">
        <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter fields..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        <div>
          <h4 className="font-medium text-sm mb-2">Patient Fields</h4>
          <div className="space-y-0">
            {filteredPatient.map((f) =>
              renderField(f, "patient", {
                displayLabel: patientDisplayLabels.get(f.columnName) ?? f.fieldName,
                storageBadge:
                  f.storageType === "direct_patient"
                    ? "Patient"
                    : f.storageType === "patient_attribute"
                      ? "Note"
                      : undefined,
              })
            )}
          </div>
        </div>
        {formFields.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-2">
              Form: {formName ?? "Assessment"}
            </h4>
            <div className="space-y-0">
              {filteredForm.map((f) => renderField(f, "form"))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        ● pure-data (settable) • ⚙ algorithm-output (warns) • ✗ source-of-truth (locked)
        {patientFields.some((f) => f.storageType) && (
          <> • Patient = dbo.Patient • Note = PatientAttribute</>
        )}
      </div>
    </div>
  );
}
