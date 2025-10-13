"use client";

import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import type { TemplateListItem } from "@/lib/services/template.service";
import type { PlaceholdersSpecSlot } from "@/lib/services/template-validator.service";

interface ApplyTemplateModalProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  template: TemplateListItem | null;
  isApplying: boolean;
  onApply: (filledSql: string, metadata: { matchedTemplate: string }) => Promise<void>;
}

function normalizePlaceholderName(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "");
}

function renderSlotLabel(slot: PlaceholdersSpecSlot): string {
  const parts = [slot.name];
  if (slot.type) parts.push(`(${slot.type})`);
  if (slot.required === false) parts.push("optional");
  return parts.join(" ");
}

export function TemplateApplyModal({
  open,
  onOpenChange,
  template,
  isApplying,
  onApply,
}: ApplyTemplateModalProps) {
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [sqlPreview, setSqlPreview] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const sqlPattern = template?.sqlPattern ?? "";

  useEffect(() => {
    if (!template) {
      setSlotValues({});
      setSqlPreview("");
      setError(null);
      return;
    }

    const initial: Record<string, string> = {};
    template.placeholdersSpec?.slots?.forEach((slot) => {
      const normalized = normalizePlaceholderName(slot.name);
      if (slot.default !== undefined && slot.default !== null) {
        initial[normalized] = String(slot.default);
      }
    });
    setSlotValues(initial);
    setSqlPreview(template.sqlPattern ?? "");
    setError(null);
  }, [template, open]);

  const handleValueChange = (placeholder: string, value: string) => {
    setSlotValues((prev) => ({ ...prev, [placeholder]: value }));
  };

  const computeFilledSql = (): { sql: string | null; error?: string } => {
    if (!template) return { sql: null };
    let filled = sqlPattern;
    const missing: string[] = [];

    (template.placeholdersSpec?.slots ?? []).forEach((slot) => {
      const normalized = normalizePlaceholderName(slot.name);
      const provided = (slotValues[normalized] ?? "").trim();
      if (!provided && slot.required !== false) {
        missing.push(slot.name);
        return;
      }
      const value = provided || String(slot.default ?? "");
      if (!value) return;
      const tokenPattern = new RegExp(
        `\\{${normalized}(\\[\\]|\\?)?\\}`,
        "gi"
      );
      filled = filled.replace(tokenPattern, value);
    });

    if (missing.length > 0) {
      return {
        sql: null,
        error: `Provide values for required placeholders: ${missing.join(", ")}`,
      };
    }

    return { sql: filled };
  };

  const generatePreview = () => {
    const result = computeFilledSql();
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.sql) {
      setSqlPreview(result.sql);
    }
  };

  const handleApply = async () => {
    if (!template) return;
    const result = computeFilledSql();
    if (result.error) {
      setError(result.error);
      return;
    }
    const finalSql = (result.sql ?? sqlPattern).trim();
    if (!finalSql) {
      setError("Generated SQL is empty");
      return;
    }
    setError(null);
    setSqlPreview(result.sql ?? sqlPattern);
    await onApply(finalSql, {
      matchedTemplate: template.name,
    });
  };

  if (!template) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply Template: {template.name}</DialogTitle>
          <DialogDescription>
            Fill in the required fields to generate SQL from the template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded border border-muted bg-muted/20 p-3 text-xs text-muted-foreground">
            Intent: {template.intent ?? "unknown"}
            {typeof template.successRate === "number" && (
              <span className="ml-3">
                Success rate: {Math.round(template.successRate * 100)}%
              </span>
            )}
          </div>

          {(template.placeholdersSpec?.slots?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {template.placeholdersSpec?.slots?.map((slot) => {
                const normalized = normalizePlaceholderName(slot.name);
                const currentValue = slotValues[normalized] ?? "";
                const required = slot.required !== false;
                const type = slot.type ?? "string";

                return (
                  <div key={slot.name} className="rounded border border-muted p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{renderSlotLabel(slot)}</p>
                        {slot.semantic && (
                          <p className="text-xs text-muted-foreground">
                            Semantic: {slot.semantic}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {required ? "Required" : "Optional"}
                      </div>
                    </div>

                    <div className="mt-3">
                      {type === "boolean" ? (
                        <div className="flex items-center space-x-3">
                          <Switch
                            checked={(currentValue || "false") === "true"}
                            onCheckedChange={(checked) =>
                              handleValueChange(normalized, checked ? "true" : "false")
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {checkedLabel(slot, currentValue)}
                          </span>
                        </div>
                      ) : type === "date" ? (
                        <Input
                          type="date"
                          value={currentValue}
                          onChange={(event) =>
                            handleValueChange(normalized, event.target.value)
                          }
                        />
                      ) : type === "int" || type === "float" || type === "decimal" ? (
                        <Input
                          type="number"
                          value={currentValue}
                          onChange={(event) =>
                            handleValueChange(normalized, event.target.value)
                          }
                          placeholder={slot.default ? String(slot.default) : ""}
                        />
                      ) : (
                        <Input
                          value={currentValue}
                          onChange={(event) =>
                            handleValueChange(normalized, event.target.value)
                          }
                          placeholder={slot.default ? String(slot.default) : ""}
                        />
                      )}
                    </div>

                    {slot.validators && slot.validators.length > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Validators: {slot.validators.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This template has no placeholders. Review the SQL preview before
              applying.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">SQL Preview</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={generatePreview}
                type="button"
              >
                Refresh Preview
              </Button>
            </div>
            <Textarea
              className="font-mono"
              rows={10}
              value={sqlPreview || sqlPattern}
              onChange={(event) => setSqlPreview(event.target.value)}
            />
          </div>

          {error && (
            <div className="rounded border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isApplying}>
            {isApplying ? "Applying..." : "Apply Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function checkedLabel(slot: PlaceholdersSpecSlot, value: string): string {
  if (value === "true") return `${slot.name} enabled`;
  if (value === "false") return `${slot.name} disabled`;
  return "Toggle value";
}
