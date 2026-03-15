/**
 * Data Generation Admin Page
 * Browse → Select → Describe → Review → Preview → Execute
 */

"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type {
  GenerationSpec,
  GenerationResult,
} from "@/lib/services/data-gen/generation-spec.types";
import { CustomerSelector } from "@/app/insights/new/components/CustomerSelector";
import { ModelSelector } from "@/app/insights/new/components/ModelSelector";
import {
  DataBrowserStep,
  type BrowseSelection,
} from "./components/data-browser-step";
import { DescribeStep } from "./components/describe-step";
import { SpecReviewStep } from "./components/spec-review-step";
import {
  WoundTrajectoryStep,
  type TrajectoryConfig,
} from "./components/wound-trajectory-step";
import {
  FormSelectorStep,
  type SelectedForm,
} from "./components/form-selector-step";
import { isWoundAssessmentForm } from "@/lib/services/data-gen/form-utils";
import { LookupManager } from "./components/lookup-manager";
import { FieldProfilesReviewStep } from "./components/field-profiles-review-step";
import { buildDefaultAssessmentSpec } from "@/lib/services/data-gen/default-spec-builder";
import { buildFallbackProfiles } from "@/lib/services/data-gen/profile-fallback";
import type { FieldProfileSet } from "@/lib/services/data-gen/trajectory-field-profile.types";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";

export default function DataGenPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"generate" | "lookups">(
    "generate",
  );
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const [selection, setSelection] = useState<BrowseSelection | null>(null);
  const [selectedForm, setSelectedForm] = useState<SelectedForm | null>(null);
  const [trajectoryConfig, setTrajectoryConfig] =
    useState<TrajectoryConfig | null>(null);
  const [fieldProfiles, setFieldProfiles] = useState<FieldProfileSet | null>(
    null,
  );
  const [woundFormSchema, setWoundFormSchema] = useState<FieldSchema[]>([]);
  const [isGeneratingProfiles, setIsGeneratingProfiles] = useState(false);
  const [spec, setSpec] = useState<GenerationSpec | null>(null);
  const [warnings, setWarnings] = useState<
    { fieldName: string; type: string; message: string; suggestion?: string }[]
  >([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewSql, setPreviewSql] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionChecking, setConnectionChecking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!customerId) {
      setConnectionError(null);
      setConnectionChecking(false);
      return;
    }
    let cancelled = false;
    setConnectionChecking(true);
    setConnectionError(null);
    fetch(
      `/api/admin/data-gen/connection-check?customerId=${encodeURIComponent(customerId)}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setConnectionChecking(false);
        if (res.ok && data.ok) {
          setConnectionError(null);
        } else {
          setConnectionError(
            data.error ?? data.message ?? "Database connection failed"
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setConnectionChecking(false);
        setConnectionError(
          err instanceof Error ? err.message : "Database connection failed"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const handleCleanup = async () => {
    if (!customerId) {
      toast({ title: "Select a customer first", variant: "destructive" });
      return;
    }
    if (
      !confirm(
        "Are you sure you want to delete all generated data (IG prefix)?",
      )
    )
      return;
    setIsCleaning(true);
    try {
      const res = await fetch(
        `/api/admin/data-gen/cleanup?customerId=${encodeURIComponent(customerId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to cleanup");
      }
      const data = await res.json();
      toast({
        title: "Cleanup Complete",
        description: `Deleted ${data.deleted?.patients ?? 0} patients and related data`,
      });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleProceedFromBrowse = (sel: BrowseSelection) => {
    setSelection(sel);
    if (sel.mode !== "assessment") {
      setSelectedForm(null);
      setTrajectoryConfig(null);
      setFieldProfiles(null);
      setWoundFormSchema([]);
    }
    setStep(2);
  };

  const isAssessment = selection?.mode === "assessment";
  const isWound = selectedForm
    ? isWoundAssessmentForm(selectedForm.assessmentFormName)
    : false;

  useEffect(() => {
    if (
      !customerId ||
      !selectedForm ||
      !trajectoryConfig ||
      !isWound ||
      fieldProfiles ||
      isGeneratingProfiles
    )
      return;

    let cancelled = false;
    let handledInCatch = false;
    setIsGeneratingProfiles(true);
    fetch("/api/admin/data-gen/generate-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        formId: selectedForm.assessmentFormId,
        woundBaselineAreaRange: trajectoryConfig.woundBaselineAreaRange,
        modelId: modelId || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setFieldProfiles(data.profiles ?? []);
        setWoundFormSchema(data.formSchema ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        handledInCatch = true;
        console.error("Profile generation failed:", err);
        toast({
          title: "Using default field distributions",
          variant: "destructive",
        });
        fetch(
          `/api/admin/data-gen/schema/forms/${selectedForm.assessmentFormId}?customerId=${encodeURIComponent(customerId)}`,
        )
          .then((r) => r.json())
          .then((schema) => {
            if (cancelled) return;
            setFieldProfiles(buildFallbackProfiles(schema ?? []));
            setWoundFormSchema(schema ?? []);
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setIsGeneratingProfiles(false);
          });
      })
      .finally(() => {
        if (!cancelled && !handledInCatch) setIsGeneratingProfiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    customerId,
    selectedForm?.assessmentFormId,
    trajectoryConfig,
    isWound,
    modelId,
    toast,
  ]);

  const handleFormSelected = (form: SelectedForm) => {
    setSelectedForm(form);
    if (selection) {
      setSelection({ ...selection, selectedForm: form });
    }
    const isWound = isWoundAssessmentForm(form.assessmentFormName);
    if (isWound) {
      // Stay on step 2, will show Trajectory next
    } else {
      // Non-wound: skip trajectory, will show Describe next
    }
  };

  const handleInterpreted = (
    newSpec: GenerationSpec,
    newWarnings: {
      fieldName: string;
      type: string;
      message: string;
      suggestion?: string;
    }[],
  ) => {
    let mergedSpec = newSpec;
    if (trajectoryConfig) {
      mergedSpec = {
        ...newSpec,
        trajectoryDistribution: trajectoryConfig.trajectoryDistribution,
        woundsPerPatient: trajectoryConfig.woundsPerPatient,
        assessmentsPerWound: trajectoryConfig.assessmentsPerWound,
        woundBaselineAreaRange: trajectoryConfig.woundBaselineAreaRange,
        assessmentIntervalDays: trajectoryConfig.assessmentIntervalDays,
        assessmentTimingWobbleDays: trajectoryConfig.assessmentTimingWobbleDays,
        missedAppointmentRate: trajectoryConfig.missedAppointmentRate,
        assessmentPeriodDays: trajectoryConfig.assessmentPeriodDays,
        assessmentStartDate: trajectoryConfig.assessmentStartDate,
      };
    }
    if (selectedForm) {
      mergedSpec = {
        ...mergedSpec,
        form: {
          assessmentTypeVersionId: selectedForm.assessmentFormId,
          name: selectedForm.assessmentFormName,
        },
      };
    }
    setSpec(mergedSpec);
    setWarnings(newWarnings);
    setStep(3);
  };

  const handleApplySuggestion = (fieldName: string, suggestion: string) => {
    if (!spec) return;
    setSpec({
      ...spec,
      fields: spec.fields.map((f) =>
        f.fieldName === fieldName
          ? {
              ...f,
              criteria: { type: "options" as const, pickFrom: [suggestion] },
            }
          : f,
      ),
    });
    setWarnings((w) =>
      w.filter(
        (x) => x.fieldName !== fieldName || x.type !== "invalid_dropdown",
      ),
    );
  };

  const handleRemoveField = (fieldName: string) => {
    if (!spec) return;
    setSpec({
      ...spec,
      fields: spec.fields.filter((f) => f.fieldName !== fieldName),
    });
    setWarnings((w) => w.filter((x) => x.fieldName !== fieldName));
  };

  const handlePreview = async () => {
    if (!spec || !customerId) return;
    try {
      const res = await fetch("/api/admin/data-gen/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, customerId }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      setPreviewRows(data.sampleRows ?? []);
      setPreviewSql(Array.isArray(data.previewSql) ? data.previewSql : []);
      setStep(4);
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const handleExecute = async () => {
    if (!spec || !customerId) return;
    setIsGenerating(true);
    setStep(5);
    try {
      const res = await fetch("/api/admin/data-gen/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, customerId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to generate");
      }
      const data = await res.json();
      setResult(data);
      toast({
        title: "Success",
        description:
          spec.mode === "update"
            ? `Updated ${data.insertedCount} patient(s)`
            : `Generated ${data.insertedCount} records`,
      });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMore = () => {
    setStep(1);
    setSelection(null);
    setSelectedForm(null);
    setTrajectoryConfig(null);
    setFieldProfiles(null);
    setWoundFormSchema([]);
    setSpec(null);
    setWarnings([]);
    setPreviewRows([]);
    setPreviewSql([]);
    setResult(null);
  };

  const handleProfilesProceed = (profiles: FieldProfileSet) => {
    if (!selection || !selectedForm || !trajectoryConfig) return;
    const spec = buildDefaultAssessmentSpec(
      woundFormSchema,
      trajectoryConfig,
      selectedForm,
      selection.selectedIds,
      profiles,
    );
    setSpec(spec);
    setWarnings([]);
    setStep(3);
  };

  const handleRollback = async () => {
    if (!customerId || !result) return;
    const hasRollbackSql =
      Array.isArray(result.rollbackSql) && result.rollbackSql.length > 0;
    const hasPatientIds =
      Array.isArray(result.insertedIds) && result.insertedIds.length > 0;
    if (!hasRollbackSql && !hasPatientIds) return;

    const count = result.insertedIds?.length ?? 0;
    const msg = hasRollbackSql
      ? "Revert the field changes made to the patient(s)?"
      : `Remove the ${count} patient(s) just created? This cannot be undone.`;
    if (!confirm(msg)) return;

    setIsRollingBack(true);
    try {
      const body = hasRollbackSql
        ? { customerId, rollbackSql: result.rollbackSql }
        : { customerId, patientIds: result.insertedIds };
      const res = await fetch("/api/admin/data-gen/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Rollback failed");
      }
      const data = await res.json();
      toast({
        title: "Rollback complete",
        description: data.message ?? "Changes reverted.",
      });
      setResult(null);
    } catch (e) {
      toast({
        title: "Rollback failed",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="w-full">
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Synthetic Data Generation
              </h1>
              <p className="text-slate-600">
                Browse, describe, and generate realistic test data
              </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <CustomerSelector value={customerId} onChange={setCustomerId} />
              <ModelSelector value={modelId} onChange={setModelId} />
              <Button
                variant="outline"
                onClick={handleCleanup}
                disabled={isCleaning || !customerId}
              >
                {isCleaning ? "Cleaning..." : "Cleanup Generated Data"}
              </Button>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "generate" | "lookups")}
        >
          <TabsList>
            <TabsTrigger value="generate">Generate Data</TabsTrigger>
            <TabsTrigger value="lookups">Manage Lookups</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-6">
            {(() => {
              const isAssessment = selection?.mode === "assessment";
              const isWound = selectedForm
                ? isWoundAssessmentForm(selectedForm.assessmentFormName)
                : false;
              const totalSteps = isAssessment ? 7 : 5;
              const displayStep =
                step === 1
                  ? 1
                  : step === 2 && isAssessment && !selectedForm
                    ? 2
                    : step === 2 &&
                        isAssessment &&
                        selectedForm &&
                        isWound &&
                        !trajectoryConfig
                      ? 3
                      : step === 2 &&
                          isAssessment &&
                          selectedForm &&
                          isWound &&
                          trajectoryConfig
                        ? 4
                        : step === 2 && isAssessment && selectedForm && !isWound
                          ? 3
                          : step === 2 && !isAssessment
                            ? 2
                            : step === 3
                              ? isAssessment
                                ? isWound
                                  ? 5
                                  : 4
                                : 3
                              : step === 4
                                ? isAssessment
                                  ? isWound
                                    ? 6
                                    : 5
                                  : 4
                                : step === 5
                                  ? isAssessment && isWound
                                    ? 7
                                    : isAssessment
                                      ? 6
                                      : 5
                                  : step;
              const stepLabel =
                step === 1
                  ? "Browse & Select"
                  : step === 2 && isAssessment && !selectedForm
                    ? "Select Assessment Form"
                    : step === 2 &&
                        isAssessment &&
                        selectedForm &&
                        isWound &&
                        !trajectoryConfig
                      ? "Wound & Trajectory Config"
                      : step === 2 &&
                          isAssessment &&
                          selectedForm &&
                          isWound &&
                          trajectoryConfig
                        ? isGeneratingProfiles
                          ? "Generating Profiles"
                          : "Review Field Profiles"
                        : step === 2
                          ? "Describe"
                          : step === 3
                            ? "Review"
                            : step === 4
                              ? "Preview"
                              : "Execution";
              return (
                <div className="mb-4 flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Step {displayStep} of {totalSteps}: {stepLabel}
                  </div>
                  {step === 1 && !customerId && (
                    <div className="flex-1 flex justify-center items-center gap-2 text-sm text-amber-600">
                      <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                      <span>Please select customer database first</span>
                    </div>
                  )}
                  {step === 1 && customerId && connectionError && (
                    <div className="flex-1 flex justify-center items-center gap-2 text-sm text-amber-600">
                      <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                      <span>{connectionError}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {step === 1 && (
              <DataBrowserStep
                customerId={customerId}
                connectionError={connectionError}
                connectionChecking={connectionChecking}
                onProceed={handleProceedFromBrowse}
              />
            )}

            {step === 2 &&
              selection &&
              selection.mode === "assessment" &&
              !selectedForm && (
                <FormSelectorStep
                  customerId={customerId}
                  patientCount={selection.selectedIds.length}
                  onFormSelected={handleFormSelected}
                  onBack={() => setStep(1)}
                />
              )}

            {step === 2 &&
              selection &&
              selection.mode === "assessment" &&
              selectedForm &&
              isWoundAssessmentForm(selectedForm.assessmentFormName) &&
              !trajectoryConfig && (
                <WoundTrajectoryStep
                  patientCount={selection.selectedIds.length}
                  onConfigure={(config) => {
                    setTrajectoryConfig(config);
                  }}
                  onBack={() => {
                    setSelectedForm(null);
                    if (selection)
                      setSelection({ ...selection, selectedForm: undefined });
                  }}
                />
              )}

            {step === 2 &&
              selection &&
              selectedForm &&
              isWound &&
              trajectoryConfig &&
              isGeneratingProfiles && (
                <Card>
                  <CardHeader>
                    <CardTitle>Generating Field Profiles</CardTitle>
                    <CardDescription>
                      AI is creating trajectory-aware value distributions...
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={undefined} className="animate-pulse" />
                  </CardContent>
                </Card>
              )}

            {step === 2 &&
              selection &&
              selectedForm &&
              isWound &&
              trajectoryConfig &&
              fieldProfiles &&
              !isGeneratingProfiles && (
                <FieldProfilesReviewStep
                  profiles={fieldProfiles}
                  onProceed={handleProfilesProceed}
                  onBack={() => {
                    setTrajectoryConfig(null);
                    setFieldProfiles(null);
                    setWoundFormSchema([]);
                  }}
                />
              )}

            {step === 2 &&
              selection &&
              (selection.mode !== "assessment" ||
                (selectedForm &&
                  !isWoundAssessmentForm(selectedForm.assessmentFormName))) && (
                <DescribeStep
                  customerId={customerId}
                  modelId={modelId}
                  selection={selection}
                  selectedForm={selectedForm ?? undefined}
                  onInterpreted={handleInterpreted}
                  onBack={() => {
                    if (selection.mode === "assessment" && selectedForm) {
                      setSelectedForm(null);
                      if (selection)
                        setSelection({ ...selection, selectedForm: undefined });
                    } else {
                      setStep(1);
                    }
                  }}
                />
              )}

            {step === 3 && spec && selection && (
              <SpecReviewStep
                spec={spec}
                warnings={warnings}
                onApplySuggestion={handleApplySuggestion}
                onRemoveField={handleRemoveField}
                onBack={() => setStep(2)}
                onPreview={handlePreview}
                title={fieldProfiles ? "Review Spec" : "Review Interpreted Spec"}
              />
            )}

            {step === 4 && spec && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 4: Preview</CardTitle>
                  <CardDescription>
                    {spec.mode === "update"
                      ? `Sample of rows that will be updated (scroll if more than fit)`
                      : "Sample rows that will be inserted (scroll if more than fit)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-md border mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {previewRows[0] &&
                            Object.keys(previewRows[0])
                              .filter((k) => k !== "_action")
                              .map((k) => (
                                <th
                                  key={k}
                                  className="px-4 py-2 text-left font-medium"
                                >
                                  {k}
                                </th>
                              ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b">
                            {Object.entries(row)
                              .filter(([k]) => k !== "_action")
                              .map(([, v], j) => (
                                <td key={j} className="px-4 py-2">
                                  {String(v ?? "—")}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {spec.mode === "update"
                      ? `Will update ${spec.count} patient(s).`
                      : `Will insert ${spec.count} rows total.`}
                  </p>
                  {previewSql.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">
                          SQL to be executed
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(previewSql.join("\n\n"));
                            const btn = event?.currentTarget;
                            if (btn) {
                              const orig = btn.textContent;
                              btn.textContent = "Copied!";
                              setTimeout(() => {
                                btn.textContent = orig;
                              }, 2000);
                            }
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-slate-700">
                        <pre className="bg-slate-900 text-slate-100 p-4 text-xs min-h-0">
                          <code>{previewSql.join("\n\n")}</code>
                        </pre>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      ← Back
                    </Button>
                    <Button onClick={handleExecute} disabled={isGenerating}>
                      Execute
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Step{" "}
                    {isAssessment && isWound ? 7 : isAssessment ? 6 : 5}
                    : Execution
                  </CardTitle>
                  <CardDescription>
                    {isGenerating ? "Generating..." : "Review results"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isGenerating && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        {(result?.steps || []).map((step: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{step.step}</div>
                                <div className="text-sm text-slate-600 mt-1">{step.message}</div>
                                {step.error && (
                                  <div className="text-sm text-red-600 mt-1">{step.error}</div>
                                )}
                              </div>
                              <Badge
                                variant={
                                  step.status === "complete"
                                    ? "default"
                                    : step.status === "in_progress"
                                      ? "secondary"
                                      : step.status === "failed"
                                        ? "destructive"
                                        : "outline"
                                }
                              >
                                {step.status === "in_progress" && "⏳"}
                                {step.status === "complete" && "✓"}
                                {step.status === "failed" && "✗"}
                                {step.status === "pending" && "○"}
                              </Badge>
                            </div>
                            {step.startedAt && step.completedAt && (
                              <div className="text-xs text-slate-500 mt-2">
                                {step.completedAt - step.startedAt}ms
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <Progress value={Math.min(90, (result?.steps?.filter((s: any) => s.status === "complete").length || 0) * 20)} />
                    </div>
                  )}

                  {!isGenerating && result && spec && (
                    <div className="space-y-4">
                      <Alert
                        variant={result.success ? "default" : "destructive"}
                        className={result.success ? "border-green-200 bg-green-50" : ""}
                      >
                        <CheckCircleIcon className={`w-4 h-4 ${result.success ? "text-green-600" : ""}`} />
                        <AlertDescription className={result.success ? "text-green-800" : ""}>
                          {spec.mode === "update"
                            ? `Successfully updated ${result.insertedCount} patient(s)`
                            : `Successfully generated ${result.insertedCount} records`}
                        </AlertDescription>
                      </Alert>
                      
                      {result.steps && result.steps.length > 0 && (
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-3">
                            Execution Timeline
                          </h4>
                          <div className="space-y-2">
                            {result.steps.map((step: any, idx: number) => (
                              <div key={idx} className="flex items-start justify-between text-sm gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{step.step}</span>
                                  <span className="text-slate-600 ml-2">{step.message}</span>
                                  {step.status === "failed" && step.error && (
                                    <div className="text-red-600 text-xs mt-1 font-mono break-all">
                                      {step.error}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {step.startedAt && step.completedAt && (
                                    <span className="text-slate-500 text-xs">
                                      {step.completedAt - step.startedAt}ms
                                    </span>
                                  )}
                                  <Badge
                                    variant={
                                      step.status === "complete"
                                        ? "default"
                                        : step.status === "failed"
                                          ? "destructive"
                                          : "secondary"
                                    }
                                  >
                                    {step.status === "complete" && "✓"}
                                    {step.status === "failed" && "✗"}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                          {result.durationMs && (
                            <div className="text-xs text-slate-600 mt-3 pt-3 border-t">
                              Total time: {(result.durationMs / 1000).toFixed(2)}s
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">
                          Verification Results
                        </h4>
                        <div className="space-y-2">
                          {result.verification.map((v, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>{v.check}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600">
                                  {v.result}
                                </span>
                                <Badge
                                  variant={
                                    v.status === "PASS"
                                      ? "default"
                                      : v.status === "WARN"
                                        ? "secondary"
                                        : "destructive"
                                  }
                                >
                                  {v.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleGenerateMore}
                          >
                            Generate More
                          </Button>
                          {(result.rollbackSql?.length ?? 0) > 0 ||
                          (result.insertedIds?.length ?? 0) > 0 ? (
                            <Button
                              variant="outline"
                              onClick={handleRollback}
                              disabled={isRollingBack}
                            >
                              {isRollingBack
                                ? "Rolling back..."
                                : "Rollback last run"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isGenerating && !result && (
                    <Alert variant="destructive">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      <AlertDescription>
                        Generation failed. Please try again.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="lookups" className="mt-6">
            <LookupManager customerId={customerId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
