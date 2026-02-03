"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/app/components/loading-dots";

interface QueryDetail {
  queryHistoryId: number;
  customerId: string;
  userId: number;
  question: string;
  sql: string;
  mode: string;
  resultCount: number;
  semanticContext: any;
  createdAt: string;
  totalDurationMs?: number | null;
  clarificationRequested?: boolean | null;
  clarifications: any[];
  validations: any[];
}

export default function QueryDetailPage() {
  const params = useParams();
  const queryId = params?.id as string | undefined;

  const [detail, setDetail] = useState<QueryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!queryId) return;

    const loadDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/audit/queries/${queryId}`);
        if (!response.ok) {
          throw new Error("Failed to load query detail");
        }
        const payload = await response.json();
        setDetail(payload);
      } catch (err: any) {
        console.error("Failed to load query detail", err);
        setError(err?.message ?? "Unable to load query detail");
      } finally {
        setIsLoading(false);
      }
    };

    loadDetail();
  }, [queryId]);

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Query Detail
              </h1>
              <p className="text-sm text-slate-600">
                Full audit trail for query {queryId}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/audit/queries">
                <Button variant="secondary">Back to Explorer</Button>
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
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  Primary query attributes and status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && !detail ? (
                  <div className="text-sm text-slate-600">Loading detail…</div>
                ) : detail ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs uppercase text-slate-500">
                        Question
                      </div>
                      <div className="text-slate-900">{detail.question}</div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Badge variant="outline">Mode: {detail.mode}</Badge>
                      <Badge variant="outline">
                        Results: {detail.resultCount}
                      </Badge>
                      <Badge variant="outline">
                        Latency: {detail.totalDurationMs ?? "-"} ms
                      </Badge>
                      <Badge variant="outline">
                        Clarification:{" "}
                        {detail.clarificationRequested ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-500">
                      Created: {new Date(detail.createdAt).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    No detail available.
                  </div>
                )}
              </CardContent>
            </Card>
          }

          {detail && (
            <Card>
              <CardHeader>
                <CardTitle>SQL</CardTitle>
                <CardDescription>
                  Executed SQL (as stored in history).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded bg-slate-900 text-slate-100 p-4 text-xs">
                  {detail.sql}
                </pre>
              </CardContent>
            </Card>
          )}

          {detail && (
            <Card>
              <CardHeader>
                <CardTitle>Clarifications</CardTitle>
                <CardDescription>
                  Clarification events linked to this query.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detail.clarifications?.length ? (
                  <div className="space-y-3">
                    {detail.clarifications.map((item: any) => (
                      <div
                        key={item.id}
                        className="rounded border border-slate-200 p-3"
                      >
                        <div className="text-sm font-medium text-slate-900">
                          {item.promptText}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.placeholderSemantic} • {item.responseType}
                        </div>
                        <div className="text-xs text-slate-600">
                          Accepted: {item.acceptedValue ?? "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    No clarifications recorded.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {detail && (
            <Card>
              <CardHeader>
                <CardTitle>SQL Validation</CardTitle>
                <CardDescription>
                  Validation events linked to this query.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detail.validations?.length ? (
                  <div className="space-y-3">
                    {detail.validations.map((item: any) => (
                      <div
                        key={item.id}
                        className="rounded border border-slate-200 p-3"
                      >
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge
                            variant={item.isValid ? "secondary" : "destructive"}
                          >
                            {item.isValid ? "Valid" : "Invalid"}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {item.errorType ?? "-"}
                          </span>
                        </div>
                        {item.errorMessage && (
                          <div className="text-xs text-slate-700 mt-2">
                            {item.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    No validation logs recorded.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isLoading && <LoadingDots />}
        </div>
      </div>
    </ProtectedRoute>
  );
}
