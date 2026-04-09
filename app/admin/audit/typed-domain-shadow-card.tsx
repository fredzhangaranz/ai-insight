"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingDots } from "@/app/components/loading-dots";

interface ShadowSnapshot {
  totalEvents: number;
  handledEvents: number;
  fallbackEvents: number;
  sameModeRatePct: number;
  sameSqlRatePct: number;
  mismatchRatePct: number;
  byRoute: Record<string, number>;
  byFallbackReason: Record<string, number>;
  topFallbackQuestions: Array<{
    question: string;
    count: number;
    fallbackReason: string | null;
  }>;
  topMismatchQuestions: Array<{
    question: string;
    count: number;
    typedRoute: string;
  }>;
}

export function TypedDomainShadowCard() {
  const [snapshot, setSnapshot] = useState<ShadowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSnapshot = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/audit/typed-domain-shadow");
        if (!response.ok) {
          throw new Error("Failed to load typed domain shadow metrics");
        }
        const data = (await response.json()) as ShadowSnapshot;
        setSnapshot(data);
      } catch (err: any) {
        console.error("[TypedDomainShadowCard] Failed to load:", err);
        setError(err?.message ?? "Unable to load typed domain shadow metrics");
      } finally {
        setLoading(false);
      }
    };

    loadSnapshot();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Typed Domain Shadow</CardTitle>
        <CardDescription>
          Live shadow comparison for the Phase 1 typed pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !snapshot ? (
          <div className="text-sm text-slate-600">
            <LoadingDots />
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : snapshot ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-slate-500">Shadow runs</p>
                <p className="text-2xl font-semibold">{snapshot.totalEvents}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Handled</p>
                <p className="text-2xl font-semibold">{snapshot.handledEvents}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Fallbacks</p>
                <p className="text-2xl font-semibold">{snapshot.fallbackEvents}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Same mode</p>
                <p className="text-2xl font-semibold">{snapshot.sameModeRatePct}%</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Same SQL</p>
                <p className="text-2xl font-semibold">{snapshot.sameSqlRatePct}%</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Mismatch rate</p>
                <p className="text-2xl font-semibold">{snapshot.mismatchRatePct}%</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-slate-500 mb-2">By route</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(snapshot.byRoute).length === 0 ? (
                    <div className="text-slate-500">No shadow events yet.</div>
                  ) : (
                    Object.entries(snapshot.byRoute).map(([route, count]) => (
                      <div key={route} className="flex justify-between">
                        <span>{route}</span>
                        <span>{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-slate-500 mb-2">Fallback reasons</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(snapshot.byFallbackReason).length === 0 ? (
                    <div className="text-slate-500">No typed fallbacks recorded.</div>
                  ) : (
                    Object.entries(snapshot.byFallbackReason).map(([reason, count]) => (
                      <div key={reason} className="flex justify-between">
                        <span>{reason}</span>
                        <span>{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-slate-500 mb-2">Top fallback questions</p>
                <div className="space-y-2 text-sm">
                  {snapshot.topFallbackQuestions.length === 0 ? (
                    <div className="text-slate-500">No fallback questions yet.</div>
                  ) : (
                    snapshot.topFallbackQuestions.map((item) => (
                      <div key={`${item.question}:${item.fallbackReason || "none"}`}>
                        <div className="font-medium text-slate-900">{item.question}</div>
                        <div className="text-slate-500">
                          {item.count} runs
                          {item.fallbackReason ? `, ${item.fallbackReason}` : ""}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-slate-500 mb-2">Top mismatch questions</p>
                <div className="space-y-2 text-sm">
                  {snapshot.topMismatchQuestions.length === 0 ? (
                    <div className="text-slate-500">No mismatches yet.</div>
                  ) : (
                    snapshot.topMismatchQuestions.map((item) => (
                      <div key={`${item.question}:${item.typedRoute}`}>
                        <div className="font-medium text-slate-900">{item.question}</div>
                        <div className="text-slate-500">
                          {item.count} runs, route {item.typedRoute}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">No metrics available.</div>
        )}
      </CardContent>
    </Card>
  );
}
