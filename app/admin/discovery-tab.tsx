"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DiscoveryStatus = "succeeded" | "failed";

type DiscoverySummary = {
  forms_discovered: number;
  fields_discovered: number;
  avg_confidence: number | null;
  fields_requiring_review: number;
  non_form_columns: number;
  non_form_columns_requiring_review: number;
  non_form_values: number;
  assessment_types_discovered: number;
  warnings: string[];
};

type DiscoveryRunResponse = {
  status: DiscoveryStatus;
  customerId: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  summary?: DiscoverySummary;
  warnings: string[];
  errors: string[];
  error?: string;
};

type DiscoveryHistoryEntry = {
  id: string;
  status: DiscoveryStatus;
  startedAt: string;
  completedAt: string | null;
  formsDiscovered: number | null;
  fieldsDiscovered: number | null;
  avgConfidence: number | null;
  warnings: string[];
  errorMessage: string | null;
  stages?: DiscoveryStageOptions;
};

type DiscoveryHistoryResponse = {
  runs: DiscoveryHistoryEntry[];
};

type ProgressStage = {
  stage: string;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  data?: Record<string, any>;
};

type DiscoveryStageOptions = {
  formDiscovery: boolean;
  nonFormSchema: boolean;
  nonFormValues: boolean; // DEPRECATED: Disabled for privacy - kept for backwards compatibility
  relationships: boolean;
  assessmentTypes: boolean;
  discoveryLogging: boolean;
};

const DEFAULT_STAGES: DiscoveryStageOptions = {
  formDiscovery: true,
  nonFormSchema: true,
  nonFormValues: false,
  relationships: true,
  assessmentTypes: true,
  discoveryLogging: true,
};

const STAGE_DESCRIPTIONS = {
  formDiscovery: "Discover and analyze form metadata and fields",
  nonFormSchema: "Discover database schemas and table structures",
  // nonFormValues: REMOVED - Privacy violation (indexed actual patient data)
  relationships: "Discover entity relationships and constraints",
  assessmentTypes: "Index assessment types with semantic concepts for assessment-level queries",
  discoveryLogging: "Log discovery events for debugging and monitoring",
};

async function apiRequest<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      // ignore parsing error and fall back to status text
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

function summarizeWarnings(warnings: string[]): string {
  if (!warnings.length) return "None";
  if (warnings.length === 1) return warnings[0];
  return `${warnings[0]} (+${warnings.length - 1} more)`;
}

export function DiscoveryTab({
  customerCode,
  customerName,
}: {
  customerCode: string;
  customerName: string;
}) {
  const { toast } = useToast();

  const [history, setHistory] = useState<DiscoveryHistoryEntry[]>([]);
  const [latestResult, setLatestResult] = useState<DiscoveryRunResponse | null>(
    null
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progressStages, setProgressStages] = useState<ProgressStage[]>([]);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [selectedStages, setSelectedStages] =
    useState<DiscoveryStageOptions>(DEFAULT_STAGES);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await apiRequest<DiscoveryHistoryResponse>(
        `/api/customers/${customerCode}/discover`
      );
      setHistory(response.runs ?? []);
    } catch (error: any) {
      toast({
        title: "Unable to load discovery history",
        description:
          error?.message || "Unexpected error while loading history.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [customerCode, toast]);

  useEffect(() => {
    if (customerCode) {
      fetchHistory();
    }
  }, [customerCode, fetchHistory]);

  const handleRunDiscovery = async () => {
    setShowStageDialog(false);
    setIsRunning(true);
    setLatestResult(null);

    // Initialize progress stages based on selected stages
    const stagesToShow: ProgressStage[] = [];
    if (selectedStages.formDiscovery) {
      stagesToShow.push({
        stage: "form_discovery",
        name: "Form Discovery",
        status: "pending",
      });
    }
    if (selectedStages.nonFormSchema) {
      stagesToShow.push({
        stage: "non_form_schema",
        name: "Non-Form Schema Discovery",
        status: "pending",
      });
    }
    if (selectedStages.relationships) {
      stagesToShow.push({
        stage: "relationships",
        name: "Entity Relationship Discovery",
        status: "pending",
      });
    }
    if (selectedStages.assessmentTypes) {
      stagesToShow.push({
        stage: "assessment_types",
        name: "Assessment Type Indexing",
        status: "pending",
      });
    }
    // nonFormValues stage removed from UI - privacy violation
    stagesToShow.push({
      stage: "summary",
      name: "Computing Summary Statistics",
      status: "pending",
    });

    setProgressStages(stagesToShow);

    try {
      // Try streaming first (preferred)
      const response = await fetch(`/api/customers/${customerCode}/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-stream-progress": "true",
        },
        credentials: "include",
        body: JSON.stringify({ stages: selectedStages }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      if (response.headers.get("content-type")?.includes("ndjson")) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("Response body reader not available");
        }

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line) continue;

            try {
              const event = JSON.parse(line);

              if (event.type === "stage-start") {
                setProgressStages((prev) =>
                  prev.map((s) =>
                    s.stage === event.data.stage
                      ? { ...s, status: "running" }
                      : s
                  )
                );
              } else if (event.type === "stage-complete") {
                setProgressStages((prev) =>
                  prev.map((s) =>
                    s.stage === event.data.stage
                      ? { ...s, status: "complete", data: event.data }
                      : s
                  )
                );
              } else if (event.type === "error") {
                setProgressStages((prev) =>
                  prev.map((s) =>
                    s.stage === event.data.stage ? { ...s, status: "error" } : s
                  )
                );
              } else if (event.type === "complete") {
                setLatestResult(event.data);
                if (event.data.status === "succeeded") {
                  const summary = event.data.summary;
                  const parts: string[] = [];
                  if ((summary?.forms_discovered ?? 0) > 0) {
                    parts.push(`${summary?.forms_discovered} forms`);
                  }
                  if ((summary?.fields_discovered ?? 0) > 0) {
                    parts.push(`${summary?.fields_discovered} fields`);
                  }
                  if ((summary?.assessment_types_discovered ?? 0) > 0) {
                    parts.push(`${summary?.assessment_types_discovered} assessment types`);
                  }
                  toast({
                    title: "Discovery completed",
                    description: parts.length > 0
                      ? `Discovered ${parts.join(", ")}.`
                      : "Discovery completed successfully.",
                  });
                  await fetchHistory();
                } else {
                  toast({
                    title: "Discovery failed",
                    description:
                      event.data.error ||
                      "Unexpected error during discovery run.",
                    variant: "destructive",
                  });
                  await fetchHistory();
                }
              }
            } catch (e) {
              // Ignore JSON parse errors on incomplete lines
            }
          }
        }
      } else {
        // Fallback to non-streaming response
        const data = await response.json();
        setLatestResult(data);

        if (data.status === "succeeded") {
          const summary = data.summary;
          const parts: string[] = [];
          if ((summary?.forms_discovered ?? 0) > 0) {
            parts.push(`${summary?.forms_discovered} forms`);
          }
          if ((summary?.fields_discovered ?? 0) > 0) {
            parts.push(`${summary?.fields_discovered} fields`);
          }
          if ((summary?.assessment_types_discovered ?? 0) > 0) {
            parts.push(`${summary?.assessment_types_discovered} assessment types`);
          }
          toast({
            title: "Discovery completed",
            description: parts.length > 0
              ? `Discovered ${parts.join(", ")}.`
              : "Discovery completed successfully.",
          });
          await fetchHistory();
        } else {
          toast({
            title: "Discovery failed",
            description: data.error || "Unexpected error during discovery run.",
            variant: "destructive",
          });
          await fetchHistory();
        }
      }
    } catch (error: any) {
      toast({
        title: "Discovery failed",
        description: error?.message ?? "Unexpected error during discovery run.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const latestSummary = latestResult?.summary;

  const latestDuration = useMemo(() => {
    if (!latestResult) return "—";
    return formatDuration(latestResult.durationSeconds);
  }, [latestResult]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle>Discovery</CardTitle>
          <CardDescription>
            Run semantic discovery for <strong>{customerName}</strong> and
            review the most recent runs.
          </CardDescription>
        </div>
        <Button onClick={() => setShowStageDialog(true)} disabled={isRunning}>
          {isRunning ? (
            <>
              <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4 mr-2" />
              Run Discovery Now
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {showStageDialog && (
          <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run Discovery for {customerName}</DialogTitle>
                <DialogDescription>
                  Select which stages to run. This process may take up to 3
                  minutes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {(
                  [
                    "formDiscovery",
                    "nonFormSchema",
                    "relationships",
                    "assessmentTypes",
                    "discoveryLogging",
                  ] as const
                ).map((stage) => (
                  <label
                    key={stage}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStages[stage]}
                      onChange={(e) =>
                        setSelectedStages((prev) => ({
                          ...prev,
                          [stage]: e.target.checked,
                        }))
                      }
                      disabled={isRunning}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {stage === "formDiscovery"
                          ? "Form Discovery"
                          : stage === "nonFormSchema"
                          ? "Non-Form Schema Discovery"
                          : stage === "relationships"
                          ? "Entity Relationship Discovery"
                          : stage === "assessmentTypes"
                          ? "Assessment Type Indexing"
                          : "Discovery Logging"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {STAGE_DESCRIPTIONS[stage as keyof typeof STAGE_DESCRIPTIONS]}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedStages(DEFAULT_STAGES)}
                  disabled={isRunning}
                >
                  Reset to Default
                </Button>
                <Button onClick={handleRunDiscovery} disabled={isRunning}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Latest Result
          </h3>
          {isRunning && progressStages.length > 0 ? (
            <div className="rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="space-y-3">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Discovery in Progress…
                </div>
                {progressStages.map((stage) => (
                  <div
                    key={stage.stage}
                    className="flex items-center gap-3 text-sm"
                  >
                    {stage.status === "pending" && (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300"></div>
                    )}
                    {stage.status === "running" && (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-blue-300 animate-spin"></div>
                    )}
                    {stage.status === "complete" && (
                      <CheckCircleIcon className="w-4 h-4 text-green-600" />
                    )}
                    {stage.status === "error" && (
                      <ExclamationTriangleIcon className="w-4 h-4 text-red-600" />
                    )}
                    <span
                      className={
                        stage.status === "complete"
                          ? "text-green-700 dark:text-green-300"
                          : stage.status === "running"
                          ? "text-blue-700 dark:text-blue-300 font-medium"
                          : stage.status === "error"
                          ? "text-red-700 dark:text-red-300"
                          : "text-gray-600 dark:text-gray-400"
                      }
                    >
                      {stage.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : latestResult ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant={
                    latestResult.status === "succeeded"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {latestResult.status === "succeeded" ? "Succeeded" : "Failed"}
                </Badge>
                <div className="flex items-center text-sm text-muted-foreground gap-1">
                  <ClockIcon className="h-4 w-4" />
                  {latestDuration}
                </div>
                <div className="text-sm text-muted-foreground">
                  Started {formatDate(latestResult.startedAt)}
                </div>
              </div>

              {latestSummary ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Forms
                    </div>
                    <div className="text-lg font-semibold">
                      {latestSummary.forms_discovered}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestSummary.fields_discovered} fields ·{" "}
                      {latestSummary.fields_requiring_review} flagged
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Non-form Coverage
                    </div>
                    <div className="text-lg font-semibold">
                      {latestSummary.non_form_columns} columns
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestSummary.non_form_columns_requiring_review} require
                      review · {latestSummary.non_form_values} values mapped
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Assessment Types
                    </div>
                    <div className="text-lg font-semibold">
                      {latestSummary.assessment_types_discovered ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Indexed with semantic concepts
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Average Confidence
                    </div>
                    <div className="text-lg font-semibold">
                      {latestSummary.avg_confidence != null
                        ? latestSummary.avg_confidence.toFixed(2)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3 md:col-span-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      Warnings
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {summarizeWarnings(latestSummary.warnings)}
                    </div>
                  </div>
                </div>
              ) : null}

              {latestResult.error ? (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" />
                  <span>{latestResult.error}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No discovery run in this session yet. Use "Run Discovery Now" to
              start a run.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recent Runs
          </h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Forms</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingHistory ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Loading history…
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No discovery runs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(run.startedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {run.completedAt
                            ? `Completed ${formatDate(run.completedAt)}`
                            : "Running"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            run.status === "succeeded"
                              ? "secondary"
                              : "destructive"
                          }
                          className="capitalize"
                        >
                          {run.status}
                        </Badge>
                        {run.errorMessage ? (
                          <div className="text-xs text-destructive mt-1">
                            {run.errorMessage}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {run.formsDiscovered != null
                          ? run.formsDiscovered
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {run.fieldsDiscovered != null
                          ? run.fieldsDiscovered
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="text-xs text-muted-foreground">
                          {run.stages
                            ? Object.entries(run.stages)
                                .filter(([_, value]) => value)
                                .map(([key]) => {
                                  // Skip nonFormValues (deprecated)
                                  if (key === "nonFormValues") return null;
                                  return STAGE_DESCRIPTIONS[
                                    key as keyof typeof STAGE_DESCRIPTIONS
                                  ];
                                })
                                .filter(Boolean)
                                .join(", ")
                            : "None"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="text-xs text-muted-foreground">
                          {run.warnings?.length
                            ? summarizeWarnings(run.warnings)
                            : "None"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
