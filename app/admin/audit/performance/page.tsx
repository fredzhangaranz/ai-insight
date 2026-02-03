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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingDots } from "@/app/components/loading-dots";

interface PerformanceRow {
  day: string;
  mode: string;
  queryCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  clarificationCount: number;
}

interface PerformanceResponse {
  performance: PerformanceRow[];
}

export default function PerformanceMetricsPage() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPerformance = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/audit/performance");
      if (!response.ok) {
        throw new Error("Failed to load performance metrics");
      }
      const payload = await response.json();
      setData(payload);
    } catch (err: any) {
      console.error("Failed to load performance metrics", err);
      setError(err?.message ?? "Unable to load performance metrics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPerformance();
  }, [loadPerformance]);

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Performance Metrics
              </h1>
              <p className="text-sm text-slate-600">
                Daily latency and throughput by execution mode.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadPerformance}
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

          <Card>
            <CardHeader>
              <CardTitle>Daily Trends</CardTitle>
              <CardDescription>
                Aggregated performance data per day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !data ? (
                <div className="text-sm text-slate-600">
                  Loading performance…
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Queries</TableHead>
                      <TableHead>Avg (ms)</TableHead>
                      <TableHead>P50 (ms)</TableHead>
                      <TableHead>P95 (ms)</TableHead>
                      <TableHead>Clarifications</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.performance ?? []).map((row, index) => (
                      <TableRow key={`${row.day}-${row.mode}-${index}`}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell>{row.mode}</TableCell>
                        <TableCell>{row.queryCount}</TableCell>
                        <TableCell>{row.avgDurationMs}</TableCell>
                        <TableCell>{row.p50DurationMs}</TableCell>
                        <TableCell>{row.p95DurationMs}</TableCell>
                        <TableCell>{row.clarificationCount}</TableCell>
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
