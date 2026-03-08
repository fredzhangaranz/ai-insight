/**
 * Data Generation Admin Page
 * Browse → Select → Describe → Review → Preview → Execute
 */

"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { GenerationSpec, GenerationResult } from "@/lib/services/data-gen/generation-spec.types";
import { CustomerSelector } from "@/app/insights/new/components/CustomerSelector";
import { ModelSelector } from "@/app/insights/new/components/ModelSelector";
import { DataBrowserStep, type BrowseSelection } from "./components/data-browser-step";
import { DescribeStep } from "./components/describe-step";
import { SpecReviewStep } from "./components/spec-review-step";
import { LookupManager } from "./components/lookup-manager";

export default function DataGenPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"generate" | "lookups">("generate");
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selection, setSelection] = useState<BrowseSelection | null>(null);
  const [spec, setSpec] = useState<GenerationSpec | null>(null);
  const [warnings, setWarnings] = useState<{ fieldName: string; type: string; message: string; suggestion?: string }[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewSql, setPreviewSql] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const { toast } = useToast();

  const handleCleanup = async () => {
    if (!customerId) {
      toast({ title: "Select a customer first", variant: "destructive" });
      return;
    }
    if (!confirm("Are you sure you want to delete all generated data (IG prefix)?")) return;
    setIsCleaning(true);
    try {
      const res = await fetch(`/api/admin/data-gen/cleanup?customerId=${encodeURIComponent(customerId)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to cleanup");
      }
      const data = await res.json();
      toast({ title: "Cleanup Complete", description: `Deleted ${data.deleted?.patients ?? 0} patients and related data` });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleProceedFromBrowse = (sel: BrowseSelection) => {
    setSelection(sel);
    setStep(2);
  };

  const handleInterpreted = (
    newSpec: GenerationSpec,
    newWarnings: { fieldName: string; type: string; message: string; suggestion?: string }[]
  ) => {
    setSpec(newSpec);
    setWarnings(newWarnings);
    setStep(3);
  };

  const handleApplySuggestion = (fieldName: string, suggestion: string) => {
    if (!spec) return;
    setSpec({
      ...spec,
      fields: spec.fields.map((f) =>
        f.fieldName === fieldName
          ? { ...f, criteria: { type: "options" as const, pickFrom: [suggestion] } }
          : f
      ),
    });
    setWarnings((w) => w.filter((x) => x.fieldName !== fieldName || x.type !== "invalid_dropdown"));
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
    setSpec(null);
    setWarnings([]);
    setPreviewRows([]);
    setPreviewSql([]);
    setResult(null);
  };

  const handleRollback = async () => {
    if (!customerId || !result) return;
    const hasRollbackSql = Array.isArray(result.rollbackSql) && result.rollbackSql.length > 0;
    const hasPatientIds = Array.isArray(result.insertedIds) && result.insertedIds.length > 0;
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
      toast({ title: "Rollback failed", description: String(e), variant: "destructive" });
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
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Synthetic Data Generation</h1>
              <p className="text-slate-600">Browse, describe, and generate realistic test data</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <CustomerSelector value={customerId} onChange={setCustomerId} />
              <ModelSelector value={modelId} onChange={setModelId} />
              <Button variant="outline" onClick={handleCleanup} disabled={isCleaning || !customerId}>
                {isCleaning ? "Cleaning..." : "Cleanup Generated Data"}
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "generate" | "lookups")}>
          <TabsList>
            <TabsTrigger value="generate">Generate Data</TabsTrigger>
            <TabsTrigger value="lookups">Manage Lookups</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-6">
            <div className="mb-4 text-sm text-muted-foreground">
              Step {step} of 5:{" "}
              {step === 1 && "Browse & Select"}
              {step === 2 && "Describe"}
              {step === 3 && "Review"}
              {step === 4 && "Preview"}
              {step === 5 && "Execution"}
            </div>

            {step === 1 && (
              <DataBrowserStep
                customerId={customerId}
                onProceed={handleProceedFromBrowse}
              />
            )}

            {step === 2 && selection && (
              <DescribeStep
                customerId={customerId}
                modelId={modelId}
                selection={selection}
                onInterpreted={handleInterpreted}
                onBack={() => setStep(1)}
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
              />
            )}

            {step === 4 && spec && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 4: Preview</CardTitle>
                  <CardDescription>
                    {spec.mode === "update"
                      ? `Sample of ${spec.count} rows that will be updated`
                      : "Sample rows (5) that will be inserted"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {previewRows[0] &&
                            Object.keys(previewRows[0])
                              .filter((k) => k !== "_action")
                              .map((k) => (
                                <th key={k} className="px-4 py-2 text-left font-medium">
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
                      <h4 className="text-sm font-medium mb-2">SQL to be executed</h4>
                      <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs overflow-auto max-h-64 border border-slate-700">
                        <code>{previewSql.join("\n\n")}</code>
                      </pre>
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
                  <CardTitle>Step 5: Execution</CardTitle>
                  <CardDescription>
                    {isGenerating ? "Generating..." : "Review results"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isGenerating && (
                    <div className="space-y-4">
                      <Progress value={50} />
                      <p className="text-sm text-slate-600">Generating records...</p>
                    </div>
                  )}

                  {!isGenerating && result && (
                    <div className="space-y-4">
                      <Alert variant={result.success ? "default" : "destructive"} className="border-green-200 bg-green-50">
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          {spec.mode === "update"
                            ? `Successfully updated ${result.insertedCount} patient(s)`
                            : `Successfully generated ${result.insertedCount} records`}
                        </AlertDescription>
                      </Alert>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Verification Results</h4>
                        <div className="space-y-2">
                          {result.verification.map((v, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span>{v.check}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600">{v.result}</span>
                                <Badge
                                  variant={
                                    v.status === "PASS" ? "default" : v.status === "WARN" ? "secondary" : "destructive"
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
                          <Button variant="outline" onClick={handleGenerateMore}>
                            Generate More
                          </Button>
                          {(result.rollbackSql?.length ?? 0) > 0 || (result.insertedIds?.length ?? 0) > 0 ? (
                            <Button
                              variant="outline"
                              onClick={handleRollback}
                              disabled={isRollingBack}
                            >
                              {isRollingBack ? "Rolling back..." : "Rollback last run"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isGenerating && !result && (
                    <Alert variant="destructive">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      <AlertDescription>Generation failed. Please try again.</AlertDescription>
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
