"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/app/components/loading-dots";
import { ConversationMetricsCard } from "./conversation-metrics";

interface AuditSummary {
  totalQueries: number;
  successRatePct: number;
  errorRatePct: number;
  avgLatencyMs: number;
  clarificationAcceptanceRatePct: number;
  templateUsageRatePct: number;
}

export default function AuditDashboardPage() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/audit/summary");
      if (!response.ok) {
        throw new Error("Failed to load audit summary");
      }
      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      console.error("Failed to load audit summary:", err);
      setError(err?.message ?? "Unable to load audit summary");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Audit Dashboard
              </h1>
              <p className="text-sm text-slate-600">
                Deployment readiness metrics for auditing, validation, and
                performance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadSummary}
                disabled={isLoading}
              >
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

          {
            <Card>
              <CardHeader>
                <CardTitle>Last 7 Days</CardTitle>
                <CardDescription>
                  Key health signals across query traffic, latency, and
                  clarification behavior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && !summary ? (
                  <div className="text-sm text-slate-600">Loading summary…</div>
                ) : summary ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase text-slate-500">
                        Total queries
                      </p>
                      <p className="text-2xl font-semibold">
                        {summary.totalQueries}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500">
                        Success rate
                      </p>
                      <p className="text-2xl font-semibold">
                        {summary.successRatePct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500">
                        Error rate
                      </p>
                      <p className="text-2xl font-semibold">
                        {summary.errorRatePct}%
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
                        Clarification acceptance
                      </p>
                      <p className="text-2xl font-semibold">
                        {summary.clarificationAcceptanceRatePct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500">
                        Template usage
                      </p>
                      <p className="text-2xl font-semibold">
                        {summary.templateUsageRatePct}%
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    No summary data available.
                  </div>
                )}
              </CardContent>
            </Card>
          }

          <ConversationMetricsCard />

          {
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Query Explorer</CardTitle>
                  <CardDescription>
                    Inspect recent query runs and statuses.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/audit/queries">
                    <Button>Open Explorer</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Clarifications</CardTitle>
                  <CardDescription>
                    Track acceptance rates and modal performance.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/audit/clarifications">
                    <Button variant="outline">
                      View Clarification Metrics
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SQL Validation</CardTitle>
                  <CardDescription>
                    Monitor error distribution and quality.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/audit/sql-validation">
                    <Button variant="outline">View Validation Metrics</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Trends</CardTitle>
                  <CardDescription>
                    Latency and volume trends by mode.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/audit/performance">
                    <Button variant="outline">View Performance</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          }
        </div>
      </div>
    </ProtectedRoute>
  );
}
