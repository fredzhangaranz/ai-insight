"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldReferencePanel } from "./field-reference-panel";
import { FieldResolutionDialogue } from "./field-resolution-dialogue";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";
import type { BrowseSelection } from "./data-browser-step";
import type { GenerationSpec } from "@/lib/services/data-gen/generation-spec.types";
import type { FieldResolution } from "@/lib/services/data-gen/field-resolver.service";
import type { SelectedForm } from "./form-selector-step";
import { buildDefaultPatientSpec } from "@/lib/services/data-gen/default-spec-builder";

interface DescribeStepProps {
  customerId: string;
  modelId: string;
  selection: BrowseSelection;
  selectedForm?: SelectedForm;
  onInterpreted: (spec: GenerationSpec, warnings: { fieldName: string; type: string; message: string; suggestion?: string }[]) => void;
  onBack: () => void;
}

export function DescribeStep({ customerId, modelId, selection, selectedForm, onInterpreted, onBack }: DescribeStepProps) {
  const [description, setDescription] = useState("");
  const [patientSchema, setPatientSchema] = useState<FieldSchema[]>([]);
  const [formSchema, setFormSchema] = useState<FieldSchema[]>([]);
  const [formName, setFormName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<FieldResolution | null>(null);

  useEffect(() => {
    if (!customerId) return;
    async function load() {
      try {
        const [patientRes, formsRes] = await Promise.all([
          fetch(`/api/admin/data-gen/schema/patients?customerId=${encodeURIComponent(customerId)}`),
          fetch(`/api/admin/data-gen/schema/forms?customerId=${encodeURIComponent(customerId)}`),
        ]);
        if (patientRes.ok) {
          const p = await patientRes.json();
          setPatientSchema(p);
        }
        if (formsRes.ok) {
          const forms = await formsRes.json();
          const formToLoad =
            selectedForm
              ? forms.find((f: { assessmentFormId: string }) => f.assessmentFormId === selectedForm.assessmentFormId) ?? forms[0]
              : forms[0];
          if (formToLoad) {
            const formId = selectedForm?.assessmentFormId ?? formToLoad.assessmentFormId;
            const fieldsRes = await fetch(
              `/api/admin/data-gen/schema/forms/${formId}?customerId=${encodeURIComponent(customerId)}`
            );
            if (fieldsRes.ok) {
              const f = await fieldsRes.json();
              setFormSchema(f);
              setFormName(selectedForm?.assessmentFormName ?? formToLoad.assessmentFormName ?? "");
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, [customerId, selectedForm?.assessmentFormId, selectedForm?.assessmentFormName]);

  const contextText =
    selection.mode === "insert"
      ? `Creating ${selection.count ?? 20} new ${selection.entity === "patient" ? "Patients" : "Assessments"}`
      : selection.mode === "update" && selection.selectedIds.length
      ? `Updating ${selection.selectedIds.length} selected Patient(s) — describe which fields to change`
      : selection.mode === "assessment" && selection.selectedIds.length
      ? `Generating assessments for ${selection.selectedIds.length} selected Patient(s)`
      : "";

  const entity =
    selection.entity === "patient" && (selection.mode === "insert" || selection.mode === "update")
      ? "patient"
      : "assessment_bundle";

  const runInterpret = async (resolvedColumns?: string[]) => {
    setLoading(true);
    setError(null);
    try {
      let formId: string | undefined;
      let formNameVal: string | undefined;
      if (entity === "assessment_bundle" && formSchema.length > 0) {
        if (selectedForm) {
          formId = selectedForm.assessmentFormId;
          formNameVal = selectedForm.assessmentFormName;
        } else {
          const formsRes = await fetch(`/api/admin/data-gen/schema/forms?customerId=${encodeURIComponent(customerId)}`);
          if (formsRes.ok) {
            const forms = await formsRes.json();
            const first = forms[0];
            if (first) {
              formId = first.assessmentFormId;
              formNameVal = first.assessmentFormName;
            }
          }
        }
      }

      const res = await fetch("/api/admin/data-gen/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || "Generate with default criteria",
          entity,
          mode: selection.mode,
          selectedIds: selection.selectedIds.length ? selection.selectedIds : undefined,
          count: selection.count ?? 20,
          formId,
          formName: formNameVal,
          customerId,
          modelId: modelId || undefined,
          resolvedColumns: resolvedColumns?.length ? resolvedColumns : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Interpretation failed");
      }

      const { spec, warnings } = await res.json();
      onInterpreted(spec, warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleInterpret = async () => {
    if (entity === "patient" && selection.mode === "update" && !description.trim()) {
      setError("Describe what you want to change — e.g. set gender to 50/50, fill missing date of birth.");
      return;
    }

    if (
      entity === "patient" &&
      selection.mode === "insert" &&
      !description.trim()
    ) {
      const spec = buildDefaultPatientSpec(
        patientSchema,
        selection.count ?? 20,
        "insert"
      );
      onInterpreted(spec, []);
      return;
    }

    if (entity !== "patient") {
      await runInterpret();
      return;
    }

    setLoading(true);
    setError(null);
    setResolution(null);
    try {
      const resolveRes = await fetch("/api/admin/data-gen/resolve-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || "Generate with default criteria",
          customerId,
          modelId: modelId || undefined,
        }),
      });

      if (!resolveRes.ok) {
        const err = await resolveRes.json();
        throw new Error(err.message ?? "Field resolution failed");
      }

      const res: FieldResolution = await resolveRes.json();
      const hasIssues =
        res.unmatched.length > 0 ||
        res.ambiguous.length > 0 ||
        res.outOfScope.length > 0;

      if (hasIssues) {
        setResolution(res);
      } else {
        const cols = res.matched.map((m) => m.columnName);
        await runInterpret(cols);
      }
    } catch {
      await runInterpret();
    } finally {
      setLoading(false);
    }
  };

  const handleResolutionProceed = (resolvedColumns: string[]) => {
    setResolution(null);
    runInterpret(resolvedColumns);
  };

  const handleResolutionFix = () => {
    setResolution(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Describe Requirements</CardTitle>
        <CardDescription>
          Describe what you want to generate in natural language. Use the field reference on the right.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {contextText && (
          <Alert className="mb-4">
            <AlertDescription>✦ {contextText}</AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-[1fr,320px] gap-6">
          <div className="space-y-4">
            <Textarea
              placeholder={
                selection.mode === "update"
                  ? "e.g. Set gender to 50% Male and 50% Female, fill missing dateOfBirth with ages 60-80"
                  : "e.g. Generate 20 patients with 50% male and 50% female, ages 60-80, all with type 2 diabetes"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="resize-none"
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {resolution && (
              <FieldResolutionDialogue
                resolution={resolution}
                schema={patientSchema}
                onProceed={handleResolutionProceed}
                onFix={handleResolutionFix}
              />
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={onBack}>
                ← Back
              </Button>
              <Button
                onClick={handleInterpret}
                disabled={
                  loading ||
                  (entity === "patient" &&
                    selection?.mode === "update" &&
                    !description.trim())
                }
              >
                {loading ? "Interpreting..." : "Interpret with AI →"}
              </Button>
            </div>
          </div>
          <div className="border-l pl-6">
            <h4 className="font-medium mb-2">Available Fields</h4>
            <FieldReferencePanel
              patientFields={patientSchema}
              formFields={formSchema}
              formName={formName}
              primarySchema={entity === "assessment_bundle" ? "form" : "patient"}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
