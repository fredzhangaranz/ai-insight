"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { LoadingDots } from "@/app/components/loading-dots";

interface IntentClassificationSummary {
  total: number;
  byMethod: Record<string, number>;
  intentCounts: Record<string, number>;
  avgLatencyMs: number;
  disagreementCount: number;
}

interface IntentClassificationLogEntry {
  id: string;
  customerId: string;
  customerCode: string;
  question: string;
  intent: string;
  method: "pattern" | "ai" | "fallback";
  confidence: number;
  latencyMs: number;
  matchedPatterns: string[] | null;
  reasoning: string | null;
  createdAt: string;
}

interface IntentClassificationDisagreement {
  id: string;
  customerId: string;
  customerCode: string;
  question: string;
  patternIntent: string;
  patternConfidence: number;
  aiIntent: string;
  aiConfidence: number;
  createdAt: string;
  resolved: boolean;
  resolutionNotes: string | null;
}

export default function IntentTelemetryPage() {
  const [summary, setSummary] = useState<IntentClassificationSummary | null>(
    null
  );
  const [logs, setLogs] = useState<IntentClassificationLogEntry[]>([]);
  const [disagreements, setDisagreements] = useState<
    IntentClassificationDisagreement[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/admin/intent-classification/logs?limit=200"
      );
      if (!response.ok) {
        throw new Error("Failed to load telemetry");
      }
      const data = await response.json();
      setSummary(data.summary ?? null);
      setLogs(data.logs ?? []);
      setDisagreements(data.disagreements ?? []);
    } catch (err: any) {
      console.error("Failed to load intent telemetry", err);
      setError(err?.message ?? "Unable to load telemetry");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTimestamp = (value: string) => {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Intent Classification Telemetry
            </h1>
            <p className="text-sm text-slate-600">
              Understand how intents are classified, when AI fallback is used,
              and why disagreements happen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              {isLoading ? <LoadingDots /> : "Refresh"}
            </Button>
            <Link href="/admin">
              <Button variant="secondary">Back to Admin</Button>
            </Link>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">
              {error}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Summary (rolling 30 days)</CardTitle>
            <CardDescription>
              Data sourced from IntentClassificationLog / Disagreement tables.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !summary ? (
              <div className="text-sm text-slate-600">Loading telemetry…</div>
            ) : summary ? (
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    Total classifications
                  </p>
                  <p className="text-2xl font-semibold">{summary.total}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    Pattern hit rate
                  </p>
                  <p className="text-2xl font-semibold">
                    {summary.total > 0
                      ? Math.round(
                          ((summary.byMethod.pattern ?? 0) / summary.total) * 100
                        )
                      : 0}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    Avg latency
                  </p>
                  <p className="text-2xl font-semibold">
                    {summary.avgLatencyMs} ms
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    Disagreements
                  </p>
                  <p className="text-2xl font-semibold text-red-600">
                    {summary.disagreementCount}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                No telemetry captured yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Classifications</CardTitle>
            <CardDescription>
              Includes “How I got this” details such as matched patterns and AI
              reasoning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && logs.length === 0 ? (
              <p className="text-sm text-slate-600">Loading logs…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-600">No log entries.</p>
            ) : (
              <ScrollArea className="max-h-[28rem]">
                <ul className="space-y-3">
                  {logs.map((log) => (
                    <li
                      key={log.id}
                      className="rounded border border-slate-200 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="secondary" className="capitalize">
                          {log.method}
                        </Badge>
                        <Badge className="capitalize">
                          {log.intent.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {formatTimestamp(log.createdAt)}
                        </span>
                        <span className="text-xs text-slate-500">
                          Customer: {log.customerCode}
                        </span>
                      </div>
                      <p className="font-medium text-slate-900 mb-2">
                        {log.question}
                      </p>
                      <div className="text-xs text-slate-600 grid gap-1">
                        <div>
                          Confidence: {(log.confidence * 100).toFixed(1)}% |
                          Latency: {log.latencyMs}ms
                        </div>
                        {log.matchedPatterns &&
                          log.matchedPatterns.length > 0 && (
                            <div>
                              Matched patterns:{" "}
                              {log.matchedPatterns.join(", ")}
                            </div>
                          )}
                        {log.reasoning && (
                          <div className="text-slate-700 italic">
                            “{log.reasoning}”
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Disagreements</CardTitle>
            <CardDescription>
              Pattern vs AI intent mismatches requiring follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && disagreements.length === 0 ? (
              <p className="text-sm text-slate-600">Loading disagreements…</p>
            ) : disagreements.length === 0 ? (
              <p className="text-sm text-slate-600">
                No disagreements recorded in the selected timeframe.
              </p>
            ) : (
              <ScrollArea className="max-h-[20rem]">
                <ul className="space-y-3">
                  {disagreements.map((item) => (
                    <li
                      key={item.id}
                      className="rounded border border-amber-200 bg-amber-50/60 p-3 text-xs text-slate-700"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="secondary" className="bg-amber-100">
                          {item.customerCode}
                        </Badge>
                        <span>{formatTimestamp(item.createdAt)}</span>
                        {item.resolved ? (
                          <Badge variant="outline" className="text-green-700">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Open</Badge>
                        )}
                      </div>
                      <div className="font-semibold">
                        Pattern: {item.patternIntent} (
                        {(item.patternConfidence * 100).toFixed(1)}%) vs AI:{" "}
                        {item.aiIntent} (
                        {(item.aiConfidence * 100).toFixed(1)}%)
                      </div>
                      <p className="mt-1 text-slate-800">{item.question}</p>
                      {item.resolutionNotes && (
                        <p className="mt-1 italic">
                          Notes: {item.resolutionNotes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
