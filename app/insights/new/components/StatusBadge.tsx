"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { SQLValidationResult } from "@/lib/services/sql-validator.service";

interface StatusBadgeProps {
  validation?: SQLValidationResult | null;
  assumptionsCount: number;
  onClick: () => void;
}

export function StatusBadge({
  validation,
  assumptionsCount,
  onClick,
}: StatusBadgeProps) {
  const hasErrors = Boolean(
    validation && !validation.isValid && validation.errors.length > 0
  );
  const hasWarnings = Boolean(validation && validation.warnings.length > 0);

  if (hasErrors) {
    const errorCount = validation!.errors.length;
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {errorCount === 1 ? "1 issue" : `${errorCount} issues`} detected
        </span>
      </button>
    );
  }

  if (hasWarnings || assumptionsCount > 0) {
    const label =
      assumptionsCount > 0
        ? `${assumptionsCount} assumption${assumptionsCount > 1 ? "s" : ""}`
        : "Warnings";
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
      >
        <Info className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>Looks good</span>
    </button>
  );
}
