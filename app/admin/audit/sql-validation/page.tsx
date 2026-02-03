"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface ValidationMetricRow {
  day: string;
  errorType: string;
  intentType: string;
  mode: string;
  validationCount: number;
  validCount: number;
  suggestionProvidedCount?: number;
  suggestionAcceptedCount?: number;
}

interface ValidationResponse {
  validations: ValidationMetricRow[];
  total: number;
  limit: number;
  offset: number;
}

interface ValidationStats {
  errorDistribution: Array<{
    errorType: string;
    intentType: string;
    count: number;
  }>;
  successRateByMode: Array<{
    mode: string;
    success_rate_pct: number;
    total_count: number;
  }>;
  suggestionStats: {
    suggestions_provided: number;
    suggestions_accepted: number;
    acceptance_rate_pct: number;
  };
}

export default function SqlValidationMetricsPage() {
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState("");
  const [intentType, setIntentType] = useState("");
  const [mode, setMode] = useState("");
  const [isValid, setIsValid] = useState("");

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (errorType.trim()) params.set("errorType", errorType.trim());
    if (intentType.trim()) params.set("intentType", intentType.trim());
    if (mode.trim()) params.set("mode", mode.trim());
    if (isValid.trim()) params.set("isValid", isValid.trim());

    try {
      const [metricsResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/audit/sql-validation?${params.toString()}`),
        fetch("/api/admin/audit/sql-validation/stats"),
      ]);

      if (!metricsResponse.ok) {
        throw new Error("Failed to load SQL validation metrics");
      }
      if (!statsResponse.ok) {
        throw new Error("Failed to load SQL validation stats");
      }

      const metricsPayload = await metricsResponse.json();
      const statsPayload = await statsResponse.json();
      setData(metricsPayload);
      setStats(statsPayload);
    } catch (err: any) {
      console.error("Failed to load SQL validation metrics", err);
      setError(err?.message ?? "Unable to load SQL validation metrics");
    } finally {
      setIsLoading(false);
    }
  }, [errorType, intentType, mode, isValid]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                SQL Validation Metrics
              </h1>
              <p className="text-sm text-slate-600">
                Validation error distribution and success rates by mode.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadMetrics}
                disabled={isLoading}
              >
                {isLoading ? <LoadingDots /> : "Refresh"}
              </Button>
              <Link href="/admin/audit">
                <Button variant="secondary">Back to Audit</Button>
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

          {stats && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Suggestion Acceptance</CardTitle>
                  <CardDescription>Last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {stats.suggestionStats?.acceptance_rate_pct ?? 0}%
                  </div>
                  <div className="text-xs text-slate-500">
                    {stats.suggestionStats?.suggestions_accepted ?? 0} accepted
                    out of {stats.suggestionStats?.suggestions_provided ?? 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Top Error Type</CardTitle>
                  <CardDescription>Last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {stats.errorDistribution?.[0]?.errorType ?? "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {stats.errorDistribution?.[0]?.count ?? 0} occurrences
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Best Mode</CardTitle>
                  <CardDescription>Success rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {stats.successRateByMode?.[0]?.mode ?? "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {stats.successRateByMode?.[0]?.success_rate_pct ?? 0}%
                    success
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Filter by error, intent, mode, or validity.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Input
                placeholder="Error type"
                value={errorType}
                onChange={(event) => setErrorType(event.target.value)}
              />
              <Input
                placeholder="Intent type"
                value={intentType}
                onChange={(event) => setIntentType(event.target.value)}
              />
              <Input
                placeholder="Mode"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              />
              <Input
                placeholder="isValid (true/false)"
                value={isValid}
                onChange={(event) => setIsValid(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Validation Metrics</CardTitle>
              <CardDescription>
                Showing {data?.validations.length ?? 0} of {data?.total ?? 0}.
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
                      <TableHead>Error Type</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Valid / Total</TableHead>
                      <TableHead>Suggestions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.validations ?? []).map((row, index) => (
                      <TableRow
                        key={`${row.errorType}-${row.intentType}-${row.day}-${index}`}
                      >
                        <TableCell>{row.day}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.errorType}</Badge>
                        </TableCell>
                        <TableCell>{row.intentType}</TableCell>
                        <TableCell>{row.mode}</TableCell>
                        <TableCell>
                          {row.validCount}/{row.validationCount}
                        </TableCell>
                        <TableCell>
                          {row.suggestionAcceptedCount ?? 0}/
                          {row.suggestionProvidedCount ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
