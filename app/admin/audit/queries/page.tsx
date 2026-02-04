"use client";

import { useCallback, useEffect, useState } from "react";
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

interface QueryExplorerRow {
  queryHistoryId: number;
  customerId: string;
  userId: number;
  question: string;
  mode: string;
  resultCount: number;
  createdAt: string;
  intent?: string;
  errorMessage?: string;
  sqlValid?: boolean | null;
  sqlErrorType?: string | null;
  totalDurationMs?: number | null;
  clarificationRequested?: boolean | null;
}

interface QueryExplorerResponse {
  queries: QueryExplorerRow[];
  total: number;
  limit: number;
  offset: number;
}

export default function QueryExplorerPage() {
  const [data, setData] = useState<QueryExplorerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");

  const loadQueries = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (mode) params.set("mode", mode);
    if (status) params.set("status", status);

    try {
      const response = await fetch(
        `/api/admin/audit/queries?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load query explorer");
      }
      const payload = await response.json();
      setData(payload);
    } catch (err: any) {
      console.error("Failed to load query explorer", err);
      setError(err?.message ?? "Unable to load query explorer");
    } finally {
      setIsLoading(false);
    }
  }, [search, mode, status]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  const statusBadge = (row: QueryExplorerRow) => {
    if (row.errorMessage || row.sqlValid === false) {
      return <Badge variant="destructive">Error</Badge>;
    }
    return <Badge variant="secondary">Success</Badge>;
  };

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="w-full space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Query Explorer
              </h1>
              <p className="text-sm text-slate-600">
                Filter and inspect recent query runs and validation outcomes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadQueries}
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
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Search by question, mode, or status.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Input
                placeholder="Search questions"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Input
                placeholder="Mode (template/direct/funnel)"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              />
              <Input
                placeholder="Status (success/error)"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Queries</CardTitle>
              <CardDescription>
                Showing {data?.queries.length ?? 0} of {data?.total ?? 0}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !data ? (
                <div className="text-sm text-slate-600">Loading queries…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Clarification</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.queries ?? []).map((row) => (
                      <TableRow key={row.queryHistoryId}>
                        <TableCell className="max-w-md">
                          <Link
                            href={`/admin/audit/queries/${row.queryHistoryId}`}
                            className="text-slate-900 hover:underline"
                          >
                            {row.question}
                          </Link>
                          <div className="text-xs text-slate-500">
                            Intent: {row.intent ?? "unknown"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.mode}</Badge>
                        </TableCell>
                        <TableCell>{statusBadge(row)}</TableCell>
                        <TableCell>{row.totalDurationMs ?? "-"} ms</TableCell>
                        <TableCell>
                          {row.clarificationRequested ? "Yes" : "No"}
                        </TableCell>
                        <TableCell>
                          {new Date(row.createdAt).toLocaleString()}
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
