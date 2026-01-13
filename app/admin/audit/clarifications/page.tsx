"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { isAuditDashboardEnabled } from "@/lib/config/audit-flags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingDots } from "@/app/components/loading-dots";

interface ClarificationMetricRow {
  day: string;
  placeholderSemantic: string;
  responseType: string;
  clarificationCount: number;
  avgTimeSpentMs?: number | null;
}

interface ClarificationResponse {
  clarifications: ClarificationMetricRow[];
  total: number;
  limit: number;
  offset: number;
}

interface ClarificationExample {
  queryHistoryId: number;
  question: string;
  createdAt: string;
}

export default function ClarificationMetricsPage() {
  const enabled = useMemo(() => isAuditDashboardEnabled(), []);
  const [data, setData] = useState<ClarificationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeholderSemantic, setPlaceholderSemantic] = useState("");
  const [responseType, setResponseType] = useState("");
  const [examples, setExamples] = useState<ClarificationExample[]>([]);
  const [exampleLabel, setExampleLabel] = useState<string | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);

  const loadMetrics = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (placeholderSemantic.trim()) params.set("placeholderSemantic", placeholderSemantic.trim());
    if (responseType.trim()) params.set("responseType", responseType.trim());

    try {
      const response = await fetch(`/api/admin/audit/clarifications?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load clarification metrics");
      }
      const payload = await response.json();
      setData(payload);
    } catch (err: any) {
      console.error("Failed to load clarification metrics", err);
      setError(err?.message ?? "Unable to load clarification metrics");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, placeholderSemantic, responseType]);

  const loadExamples = async (semantic: string) => {
    setExampleLoading(true);
    setExampleLabel(semantic);
    try {
      const response = await fetch(
        `/api/admin/audit/clarifications/examples?placeholderSemantic=${encodeURIComponent(semantic)}`
      );
      if (!response.ok) {
        throw new Error("Failed to load clarification examples");
      }
      const payload = await response.json();
      setExamples(payload.examples ?? []);
    } catch (err) {
      console.error("Failed to load clarification examples", err);
      setExamples([]);
    } finally {
      setExampleLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Clarification Metrics</h1>
              <p className="text-sm text-slate-600">
                Acceptance and response patterns by placeholder semantic.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadMetrics} disabled={isLoading}>
                {isLoading ? <LoadingDots /> : "Refresh"}
              </Button>
              <Link href="/admin/audit">
                <Button variant="secondary">Back to Audit</Button>
              </Link>
            </div>
          </div>

          {!enabled && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4 text-sm text-amber-800">
                The audit dashboard is disabled. Set ENABLE_AUDIT_DASHBOARD=true to enable.
              </CardContent>
            </Card>
          )}

          {enabled && error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
            </Card>
          )}

          {enabled && (
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Filter by placeholder or response type.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Input
                  placeholder="Placeholder semantic"
                  value={placeholderSemantic}
                  onChange={(event) => setPlaceholderSemantic(event.target.value)}
                />
                <Input
                  placeholder="Response type (accepted/custom/abandoned)"
                  value={responseType}
                  onChange={(event) => setResponseType(event.target.value)}
                />
              </CardContent>
            </Card>
          )}

          {enabled && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Metrics</CardTitle>
                <CardDescription>
                  Showing {data?.clarifications.length ?? 0} of {data?.total ?? 0}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && !data ? (
                  <div className="text-sm text-slate-600">Loading metrics…</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Placeholder</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>Count</TableHead>
                        <TableHead>Avg Time (ms)</TableHead>
                        <TableHead>Examples</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.clarifications ?? []).map((row, index) => (
                        <TableRow key={`${row.placeholderSemantic}-${row.day}-${row.responseType}-${index}`}>
                          <TableCell>{row.day}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.placeholderSemantic}</Badge>
                          </TableCell>
                          <TableCell>{row.responseType}</TableCell>
                          <TableCell>{row.clarificationCount}</TableCell>
                          <TableCell>{row.avgTimeSpentMs ?? "-"}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => loadExamples(row.placeholderSemantic)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {enabled && exampleLabel && (
            <Card>
              <CardHeader>
                <CardTitle>Examples for {exampleLabel}</CardTitle>
                <CardDescription>Recent queries triggering this placeholder.</CardDescription>
              </CardHeader>
              <CardContent>
                {exampleLoading ? (
                  <div className="text-sm text-slate-600">Loading examples…</div>
                ) : examples.length > 0 ? (
                  <div className="space-y-3">
                    {examples.map((example) => (
                      <div key={example.queryHistoryId} className="rounded border border-slate-200 p-3">
                        <div className="text-sm text-slate-900">{example.question}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(example.createdAt).toLocaleString()}
                        </div>
                        <Link
                          href={`/admin/audit/queries/${example.queryHistoryId}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View detail
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">No examples available.</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
