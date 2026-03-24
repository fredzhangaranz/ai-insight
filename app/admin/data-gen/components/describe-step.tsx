"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldReferencePanel } from "./field-reference-panel";
import { FieldResolutionDialogue } from "./field-resolution-dialogue";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";
import type { BrowseSelection } from "./data-browser-step";
import type { GenerationSpec } from "@/lib/services/data-gen/generation-spec.types";
import type { FieldResolution } from "@/lib/services/data-gen/field-resolver.service";
import type { SelectedForm } from "./form-selector-step";
import {
  buildDefaultPatientSpec,
  applyAgeConfigToSpec,
  type AgeConfigInput,
} from "@/lib/services/data-gen/default-spec-builder";

interface DescribeStepProps {
  customerId: string;
  modelId: string;
  selection: BrowseSelection;
  selectedForm?: SelectedForm;
  onInterpreted: (spec: GenerationSpec, warnings: { fieldName: string; type: string; message: string; suggestion?: string }[]) => void;
  onBack: () => void;
}

interface PatientPresetSummary {
  id: string;
  name: string;
  description: string;
}

const MIN_PATIENT_COUNT = 1;
const MAX_PATIENT_COUNT = 100;
const DEFAULT_PATIENT_COUNT = 20;
const MIN_AGE = 18;
const MAX_AGE = 120;
const DEFAULT_AGE_MIN = 60;
const DEFAULT_AGE_MAX = 80;
const DEFAULT_AGE_MEAN = 70;
const DEFAULT_AGE_SD = 8;
/** Default insert preset; must match `id` in `data/patient-presets/default-patient-presets.json`. */
const DEFAULT_PATIENT_PRESET_ID = "nz-urban";

function clampCount(n: number): number {
  return Math.min(MAX_PATIENT_COUNT, Math.max(MIN_PATIENT_COUNT, n));
}

function clampAge(n: number): number {
  return Math.min(MAX_AGE, Math.max(MIN_AGE, n));
}

export function DescribeStep({ customerId, modelId, selection, selectedForm, onInterpreted, onBack }: DescribeStepProps) {
  const [description, setDescription] = useState("");
  const [patientSchema, setPatientSchema] = useState<FieldSchema[]>([]);
  const [formSchema, setFormSchema] = useState<FieldSchema[]>([]);
  const [formName, setFormName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<FieldResolution | null>(null);
  const [patientPresets, setPatientPresets] = useState<PatientPresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    DEFAULT_PATIENT_PRESET_ID,
  );
  const isInsertPatient = selection.entity === "patient" && selection.mode === "insert";
  const [insertCountRaw, setInsertCountRaw] = useState(() =>
    String(selection.count ?? DEFAULT_PATIENT_COUNT)
  );
  const insertCount = (() => {
    const n = parseInt(insertCountRaw, 10);
    if (Number.isNaN(n)) return DEFAULT_PATIENT_COUNT;
    return clampCount(n);
  })();
  const insertCountInvalid =
    isInsertPatient &&
    (insertCountRaw === "" ||
      Number.isNaN(parseInt(insertCountRaw, 10)) ||
      parseInt(insertCountRaw, 10) < MIN_PATIENT_COUNT ||
      parseInt(insertCountRaw, 10) > MAX_PATIENT_COUNT);

  const [ageMode, setAgeMode] = useState<"uniform" | "normal">("normal");
  const [ageMinRaw, setAgeMinRaw] = useState(String(DEFAULT_AGE_MIN));
  const [ageMaxRaw, setAgeMaxRaw] = useState(String(DEFAULT_AGE_MAX));
  const [ageMeanRaw, setAgeMeanRaw] = useState(String(DEFAULT_AGE_MEAN));
  const [ageSdRaw, setAgeSdRaw] = useState(String(DEFAULT_AGE_SD));

  const ageMin = clampAge(parseInt(ageMinRaw, 10) || DEFAULT_AGE_MIN);
  const ageMax = clampAge(parseInt(ageMaxRaw, 10) || DEFAULT_AGE_MAX);
  const ageMean = clampAge(parseInt(ageMeanRaw, 10) || DEFAULT_AGE_MEAN);
  const ageSd = Math.min(20, Math.max(1, parseInt(ageSdRaw, 10) || DEFAULT_AGE_SD));

  const ageConfigInvalid =
    isInsertPatient &&
    (ageMin >= ageMax ||
      (ageMode === "normal" && (ageMean < ageMin || ageMean > ageMax)));

  const ageConfig: AgeConfigInput = {
    mode: ageMode,
    minAge: ageMin,
    maxAge: ageMax,
    ...(ageMode === "normal" && { mean: ageMean, sd: ageSd }),
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/data-gen/patient-presets")
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as PatientPresetSummary[];
      })
      .then((presets) => {
        if (!cancelled) setPatientPresets(presets);
      })
      .catch((error) => {
        console.error("Failed to load patient presets:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patientPresets.length) return;
    setSelectedPresetId((prev) => {
      if (prev === "none") return prev;
      return patientPresets.some((p) => p.id === prev) ? prev : "none";
    });
  }, [patientPresets]);

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

  const effectiveCount = isInsertPatient ? insertCount : (selection.count ?? DEFAULT_PATIENT_COUNT);
  const contextText =
    selection.mode === "insert"
      ? `Creating ${effectiveCount} new ${selection.entity === "patient" ? "Patients" : "Assessments"}`
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
          count: effectiveCount,
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

      const interpreted = (await res.json()) as {
        spec: GenerationSpec;
        warnings: {
          fieldName: string;
          type: string;
          message: string;
          suggestion?: string;
        }[];
      };
      const { spec, warnings } = interpreted;
      
      let mergedSpec = spec;
      
      // For patient insert mode: merge AI spec with defaults to ensure all fields are present
      if (entity === "patient" && isInsertPatient) {
        const defaultSpec = buildDefaultPatientSpec(
          patientSchema,
          effectiveCount,
          "insert",
          ageConfig
        );
        
        // Build a map of AI-specified field column names for quick lookup
        // Start with default fields, then overlay AI fields (AI choices override defaults)
        const mergedFields = defaultSpec.fields.map((defaultField) => {
          const aiField = spec.fields.find((f) => f.columnName === defaultField.columnName);
          return aiField || defaultField;
        });
        
        // Add any AI fields that aren't in defaults (e.g., custom user-defined fields)
        for (const aiField of spec.fields) {
          if (!defaultSpec.fields.some((f) => f.columnName === aiField.columnName)) {
            mergedFields.push(aiField);
          }
        }
        
        mergedSpec = {
          ...spec,
          presetId: selectedPresetId !== "none" ? selectedPresetId : undefined,
          fields: mergedFields,
        };
      } else {
        mergedSpec = {
          ...spec,
          presetId: selectedPresetId !== "none" ? selectedPresetId : undefined,
        };
      }
      
      onInterpreted(mergedSpec, warnings);
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
    if (isInsertPatient && insertCountInvalid) {
      setError(`Number of patients must be between ${MIN_PATIENT_COUNT} and ${MAX_PATIENT_COUNT}.`);
      return;
    }
    if (isInsertPatient && ageConfigInvalid) {
      setError("Age: min must be less than max; for Normal mode, mean must be within range.");
      return;
    }

    if (
      entity === "patient" &&
      selection.mode === "insert" &&
      !description.trim()
    ) {
      const spec = buildDefaultPatientSpec(
        patientSchema,
        effectiveCount,
        "insert",
        ageConfig
      );
      onInterpreted(
        {
          ...spec,
          presetId: selectedPresetId !== "none" ? selectedPresetId : undefined,
        },
        [],
      );
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

        {isInsertPatient && (
          <div className="mb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patient-count">Number of patients</Label>
              <Input
                id="patient-count"
                type="text"
                inputMode="numeric"
                min={MIN_PATIENT_COUNT}
                max={MAX_PATIENT_COUNT}
                value={insertCountRaw}
                onChange={(e) => setInsertCountRaw(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="w-24"
                aria-invalid={insertCountInvalid}
              />
              {insertCountInvalid && (
                <p className="text-sm text-destructive">
                  Enter a number between {MIN_PATIENT_COUNT} and {MAX_PATIENT_COUNT}.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Age Distribution</h4>
              <RadioGroup
                value={ageMode}
                onValueChange={(v) => setAgeMode(v as "uniform" | "normal")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="uniform" id="age-uniform" />
                  <Label htmlFor="age-uniform" className="font-normal">
                    Uniform
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="normal" id="age-normal" />
                  <Label htmlFor="age-normal" className="font-normal">
                    Normal (clustered)
                  </Label>
                </div>
              </RadioGroup>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="age-min">Min age</Label>
                  <Input
                    id="age-min"
                    type="number"
                    min={MIN_AGE}
                    max={MAX_AGE}
                    value={ageMinRaw}
                    onChange={(e) => setAgeMinRaw(e.target.value)}
                    className="w-20"
                  />
                </div>
                <div>
                  <Label htmlFor="age-max">Max age</Label>
                  <Input
                    id="age-max"
                    type="number"
                    min={MIN_AGE}
                    max={MAX_AGE}
                    value={ageMaxRaw}
                    onChange={(e) => setAgeMaxRaw(e.target.value)}
                    className="w-20"
                  />
                </div>
                {ageMode === "normal" && (
                  <>
                    <div>
                      <Label htmlFor="age-mean">Mean</Label>
                      <Input
                        id="age-mean"
                        type="number"
                        min={MIN_AGE}
                        max={MAX_AGE}
                        value={ageMeanRaw}
                        onChange={(e) => setAgeMeanRaw(e.target.value)}
                        className="w-20"
                      />
                    </div>
                    <div>
                      <Label htmlFor="age-sd">SD</Label>
                      <Input
                        id="age-sd"
                        type="number"
                        min={1}
                        max={20}
                        value={ageSdRaw}
                        onChange={(e) => setAgeSdRaw(e.target.value)}
                        className="w-20"
                      />
                    </div>
                  </>
                )}
              </div>
              {ageConfigInvalid && (
                <p className="text-sm text-destructive">
                  Min must be less than max. For Normal mode, mean must be within range.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-preset">Default patient preset</Label>
              <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                <SelectTrigger id="patient-preset" className="max-w-sm">
                  <SelectValue placeholder="Choose a preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preset</SelectItem>
                  {patientPresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPresetId !== "none" && (
                <p className="text-sm text-muted-foreground">
                  {patientPresets.find((preset) => preset.id === selectedPresetId)?.description}
                </p>
              )}
            </div>
          </div>
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
                    !description.trim()) ||
                  (isInsertPatient && insertCountInvalid) ||
                  (isInsertPatient && ageConfigInvalid)
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
